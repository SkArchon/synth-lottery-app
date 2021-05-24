//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/dev/VRFConsumerBase.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

import "./LotteryTicket.sol";

// We do not need to use safemath since solidity 0.8 have overflow checks by default
//import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract Lottery is LotteryTicket, VRFConsumerBase {
  using Counters for Counters.Counter;

  uint16  private constant maxWinningPercentages = 20;
  uint16  private constant maxHasWonIterationCount = 2000;
  uint256 private constant linkFee = 0.1 * 10 ** 18;

  bool    private firstPurchaseDone = false;
  uint8[] private winningPercentages;
  uint64  private currentDrawTimestamp;
  uint256 private ticketPurchaseCurrentZeroIndex = 0;
  uint256 private startTokenId;

  // Link VRF specific variables
  bytes32 private keyHash;
  bytes32 private startDrawRequestId;

  // Configurations for the next draw (5 minutes set for testing)
  uint64 private nextDrawDuration = 8 minutes;
  // We set a variable for lottery processing because
  // block.timestmap's accuracy cannot be relied upon
  // And we dont want a user to purchase a ticket during
  // the processing going on
  bool   private lotteryProcessing = false;

  Counters.Counter private drawNumberTracker;

  address vrfCoordinatorAddressForCheck;

  mapping (uint256 => bool) public _winningTokens;

  event LotteryDraw(uint256 indexed drawNumber, uint256 drawTotal, uint256 drawTimestamp);

  // TODO : The consumer and link token address should be passed via constructor
  constructor(bytes32 _keyHash, address _vrfCoordinator, address _linkAddress, address _sUsdAddress) 
      LotteryTicket(
        _sUsdAddress
      )
      VRFConsumerBase(
        _vrfCoordinator,
        _linkAddress
      )
    {
    keyHash = _keyHash;
    vrfCoordinatorAddressForCheck = _vrfCoordinator;
    currentDrawTimestamp = uint64(block.timestamp + 5 minutes);
    
    winningPercentages.push(50);
    winningPercentages.push(35);
    winningPercentages.push(15);

    // We dont want draw 0 to exist
    drawNumberTracker.increment();
    startTokenId = _getLastTicketPurchased() + 1;
  } 

  modifier onlyRandomGenerator {
		require(msg.sender == vrfCoordinatorAddressForCheck, "Must be correct generator");
		_;
	}

  function getDetails() external view returns (
      uint256 amount, 
      uint64 timestamp,
      uint256 currentDrawNumber,
      uint256 ticketPrice
    ) {
    uint256 accountBalance = sUsdToken.balanceOf(address(this));
    uint256 _amount = accountBalance - _getLockedContractPoolAmount();
    uint256 _currentDrawNumber = drawNumberTracker.current();
    uint256 _ticketPrice = _getTicketPrice();
    uint64 _timestamp = currentDrawTimestamp;

    return (
      _amount,
      _timestamp,
      _currentDrawNumber,
      _ticketPrice
    );
  }

  /** 
    * Requests randomness from a user-provided seed
    */
  function startDraw(uint256 userProvidedSeed) public returns (bytes32 requestId) {
    // TODO: Fix
    require(currentDrawTimestamp <= (block.timestamp + 960 seconds), "The time period has not yet passed");

    // Even though there can be exactly one participant we still use VRF to keep it "fair"
    if(getParticipantsCount() > 0) {
      require(LINK.balanceOf(address(this)) >= linkFee, "Not enough LINK in contract address");
      startDrawRequestId = requestRandomness(keyHash, linkFee, userProvidedSeed);
      lotteryProcessing = true;
      return startDrawRequestId;
    } else {
      uint256 accountBalance = sUsdToken.balanceOf(address(this));
      uint256 contractPoolTotal = accountBalance - _getLockedContractPoolAmount();
      completeLottery(contractPoolTotal);
      return bytes32("");
    }
  }

  function fulfillRandomness(bytes32 requestId, uint256 randomness) internal override {
    require(startDrawRequestId == requestId, "The start draw and fulfill randomness request Ids didnt match");
    processDraw(randomness);
  }
    
  /**
   * Callback function used by VRF Coordinator
   */
  function processDraw(uint256 randomness) private onlyRandomGenerator {
    // Get the correct contractPoolTotal by subtracting
    // the locked amount
    uint256 accountBalance = sUsdToken.balanceOf(address(this));
    uint256 contractPoolTotal = accountBalance - _getLockedContractPoolAmount();

    uint256 lastTicketIdPurchased = _getLastTicketPurchased();

    // Since tokens are numerical, we use the tokenIds to calculate the winners
    uint256 participantsCount = getParticipantsCount();
    uint256 remainingContractPool = contractPoolTotal;
    
    // In cases there are less participants than there are winning distributions
    // (In these cases, we allow the winner to get the enire remaining distribution)
    // However this can easily be changed, for example to carry over to the next draw
    uint256 iterationLength = (participantsCount > winningPercentages.length)
      ? winningPercentages.length
      : participantsCount;

    // We reverse iterate because we want to add any remaining values to the winner
    for (uint256 _i = iterationLength; _i > 0; _i--) {
      uint256 index = _i - 1; // In order to not trigger underflow validations we do not do arrLength - 1
      uint256 winningPercentage = winningPercentages[index];
      uint256 rand = getRandomForPlacing(randomness, (index + 1));

      uint256 winningAmount = calculatePercentage(contractPoolTotal, winningPercentage);
      remainingContractPool -= winningAmount;

      // When the user is the winner
      // We add any remaining amounts that would have been left
      if(index == 0) {
        winningAmount += remainingContractPool;
      }

      // TODO : check what happens when participants is the last entry (cant go out of bounds)
      uint256 winningToken = getWinningToken(lastTicketIdPurchased, rand, participantsCount);
      allocateWinnings(winningToken, winningAmount);

      _winningTokens[winningToken] = true;
    }

    completeLottery(contractPoolTotal);
  }

  function getWinningToken(uint256 lastTokenId, uint256 rand, uint256 participantsCount) private view returns (uint256) {
      uint256 winningToken;
      uint16 incrementer = 0;
      uint256 winningBase = (startTokenId + (rand % (participantsCount + 1)));

      /**
        While this itself looks like it could cause an infinite loop we only allow 20 winning percentages max.
        Whih means within traversing 20 times max (worst case), we will always find a unique number.

        This is ON TOP of the fact that a collission itself would keep getting rarer as the participant list grows.
        Since colissions are rare, we opt against constantly generating a pseudo random number to add onto the true random number
        And instead opt to go to the next token.

        (Note that the Map acesses are O(1) so it wont have a huge cost, except for storage. Where there would be maximum, 20 more
        entries per draw, if we assume a week. that would be (20 * 53) new entries per year)
        */
      do {
        // TODO : what happens when the last index is hit twice?? we might need to decrease??
        winningToken = winningBase + incrementer;
        incrementer++;

        // When the last tokenId has been surpassed
        if((incrementer + winningToken) > lastTokenId) {
          winningBase = startTokenId;
          incrementer = 0;
        }
      } while(_winningTokens[winningToken] || winningToken > lastTokenId);

      return winningToken;
  }

  /**
   * Since we already have a true random seed, we will use it to create more
   */
  function getRandomForPlacing(uint seed, uint place) private pure returns (uint256) {
    return uint256(keccak256(abi.encode(seed, place)));
  }

  function completeLottery(uint256 contractPoolTotal) private {
    emit LotteryDraw(drawNumberTracker.current(), contractPoolTotal, currentDrawTimestamp);

    drawNumberTracker.increment();
    firstPurchaseDone = false;
    // TODO : Put validation if the cron is not called the currentDrawTimestamp can be less than current date
    currentDrawTimestamp = currentDrawTimestamp + nextDrawDuration;
    lotteryProcessing = false;

    _refreshTicketPriceForNextDraw();
  }

  function getParticipantsCount() private view returns (uint256) {
    if(!firstPurchaseDone) {
      return 0;
    }
    uint256 lastTicketIdPurchased = _getLastTicketPurchased();
    uint256 participantsCount = (lastTicketIdPurchased - startTokenId) + 1;
    return participantsCount;
  }
  /**
    Calculate the balance based on the percentage
    (Note that solidity will omit the floating point amount)
  */
  function calculatePercentage(uint amount, uint percentage) private pure returns (uint256){
      return amount * percentage / 100;
  }

  function buyTicket(uint32 ticketCount, uint256 drawNumber) external {
    uint256 currentDrawNumber = drawNumberTracker.current();
    require(drawNumber == currentDrawNumber, "The draw number passed was invalid");
    require(!lotteryProcessing, "The draw has started, please purchase for the next draw");

    // Due to the difficulty of miners to manipulate the block within 900 seconds we put
    // a check of current time (plus buffer of (900 * 2) seconds)
    // ref: https://ethereum.stackexchange.com/questions/6795/is-block-timestamp-safe-for-longer-time-periods
    // ref: https://github.com/ethereum/wiki/blob/c02254611f218f43cbb07517ca8e5d00fd6d6d75/Block-Protocol-2.0.md
    require(currentDrawTimestamp > (block.timestamp - 960 seconds), "The time period has expired");
    
    /**
      Each time a draw is reset we reset firstPurchaseDone to false
      So when the first purchase OF THE NEXT Draw happens we capture
      the next token Id
     */
    if(!firstPurchaseDone) {
      // We set this before the ACTUAL purchase/increase
      // which is _buyTicket so add 1 to get the future id
      startTokenId = _getLastTicketPurchased() + 1; 
      firstPurchaseDone = true;
    }
    _buyTicket(ticketCount);
  }

  //====================================+
  // Administration Setters
  //=====================================

  // TODO : There were potential issues of arrays been passed, to check
  function setWinningPercentages(uint8[] memory percentageDistribution) external onlyOwner {
    require(percentageDistribution.length <= maxWinningPercentages, "There cannot be more than the max distributions");
    uint8 currentTotal = 0;
    
    uint8 lastPercentage = 0;

    for (uint8 i = uint8(percentageDistribution.length); i > 0; i--) {
      uint8 currentPercentage = percentageDistribution[(i - 1)];
      require (currentPercentage > 0 && currentPercentage <= 100, "Invalid percentage passed");
      require (currentPercentage >= lastPercentage, "The array percentages must be in descending order");
      currentTotal += currentPercentage;
      lastPercentage = currentPercentage;
    }
    
    // Technically there can be an amount leftover for the contract owner
    // However the requirement was interpreted as no fees / etc are taken
    require (currentTotal == 100, "The percentage did not add up to 100");
    winningPercentages = percentageDistribution;    
  }

  function setNextDrawDuration(uint64 newNextDrawDuration) external onlyOwner {
    // This is to prevent any accidental draws running for years
    require(newNextDrawDuration <= 31 days, "You cannot set the draw for more than a month");
    nextDrawDuration = newNextDrawDuration;
  }

}
