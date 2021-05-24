//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

import "./SynthUsd.sol";

contract LotteryTicket is Ownable, ERC721Enumerable {
  using Counters for Counters.Counter;

  struct UserTicketDetails {
      uint256 ticketId;
      uint256 winnings;
  }
  
  SynthUsd internal sUsdToken;
  
  // 18 Decimals
  string private constant nftSymbol = "SNLOT";
  string private constant nftName = "Snx Lottery Ticket";
  uint16 private constant maxTicketsPerPurchase = 100;

  // We do not want to change the price of the ticket price in the draw
  // after it has already started as this would give a positive or negative advantage
  // to the person buying next
  // (e.g. - 10 users buy tickets at 2 million each to make the pool 20 mil
  // the ticket price is made to susd 20, the user with the 20 usd bought a ticket at
  // an advantage)
  uint256 private ticketPrice;
  uint256 nextTicketPrice;

  Counters.Counter private tokenIdTracker;
  uint256 private lockedContractPoolAmount = 0;

  mapping(uint256 => uint256) private _winningAmounts;

  constructor(address sUsdAddress) ERC721(nftName, nftSymbol) {
      sUsdToken = SynthUsd(sUsdAddress);
      ticketPrice = 20 * 10 ** 18;
      nextTicketPrice = ticketPrice;
      tokenIdTracker.increment();
  }

  function allocateWinnings(uint256 tokenId, uint256 amount) internal {
      lockedContractPoolAmount += amount;
      // TODO : + not needed anymore, to check and modify
      _winningAmounts[tokenId] += amount;
  }

  function claimFunds(uint256 tokenId) external {
      require(_exists(tokenId), "This token Id does not exist");
      require(
          ownerOf(tokenId) == msg.sender,
          "Unable to access different owners tokens"
      );

      uint256 winningAmount = _winningAmounts[tokenId];
      require(winningAmount > 0, "This token Id did not win anything");

      sUsdToken.transfer(msg.sender, winningAmount);

      // Reduce the pool amount since user claimed it
      lockedContractPoolAmount -= winningAmount;
      _winningAmounts[tokenId] = 0;
  }

  function _buyTicket(uint32 ticketCount) internal {
    require(
        maxTicketsPerPurchase >= ticketCount,
        "You have exceeded the max ticket count per purchase"
    );
    uint256 totalPrice = ticketCount * ticketPrice;

    for (uint32 i = 0; i < ticketCount; i++) {
        uint256 tokenId = tokenIdTracker.current();
        tokenIdTracker.increment();

        _safeMint(msg.sender, tokenId);
    }

    sUsdToken.transferFrom(msg.sender, address(this), totalPrice);
  }

  function _getTicketPrice() internal view returns (uint256) {
      return ticketPrice;
  }

  function _getLockedContractPoolAmount() internal view returns (uint256) {
      return lockedContractPoolAmount;
  }

  function _refreshTicketPriceForNextDraw() internal {
      ticketPrice = nextTicketPrice;
  }

  function _getLastTicketPurchased() internal view returns (uint256) {
      // Technically 0 means no tickets purchased at all
      return tokenIdTracker.current() - 1;
  }

  /**
    This function has an unchecked pagination (for now),
    If user buys million tickets, it will loop for a million
    Even though there is no gas cost as it is a view
    it will hinder UX
   */
  function hasUnclaimedWinnings(address owner) external view
    returns (
        bool userHasUnclaimedWinnings,
        uint256 lastIndex,
        uint256 totalTokens
    ) {
    uint256 tokensForOwner = ERC721.balanceOf(owner);

    for (uint256 i = 0; i < tokensForOwner; i++) {
        uint256 tokenId = tokenOfOwnerByIndex(owner, i);
        if (_winningAmounts[tokenId] > 0) {
            return (true, i, tokensForOwner);
        }
    }

    return (false, tokensForOwner, tokensForOwner);
  }


  function getUserTickets(address owner) external view returns (UserTicketDetails[] memory) {
    uint256 tokensForOwner = ERC721.balanceOf(owner);

    UserTicketDetails[] memory userTickets = new UserTicketDetails[](tokensForOwner);
    for (uint256 i = tokensForOwner; i > 0; i--) {
      uint256 index = i - 1;
      uint256 tokenId = tokenOfOwnerByIndex(owner, (index));
      UserTicketDetails memory ticket = UserTicketDetails(tokenId, _winningAmounts[tokenId]);
      userTickets[index] = ticket;
    }

    return userTickets;
  }

  //=====================================
  // Administration Setters
  //=====================================

  function setNextDrawTicketPrice(uint256 newTicketPrice) external onlyOwner {
      nextTicketPrice = newTicketPrice;
  }

  function updateUsdContract(address newAddress) external onlyOwner {
      sUsdToken = SynthUsd(newAddress);
  }
}
