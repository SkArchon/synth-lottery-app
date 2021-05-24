const Lottery = artifacts.require("Lottery");

module.exports = async function(deployer) {
  const keyHash = "0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4";
  const vrfCoordinator = "0xdD3782915140c8f3b190B5D67eAc6dc5760C46E9";
  const linkTokenAddress = "0xa36085F69e2889c224210F603D836748e7dC0088";
  
  const sUsdAddress = "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51";
  const lotteryDeployment = await deployer.deploy(Lottery, keyHash, vrfCoordinator, linkTokenAddress, sUsdAddress);
  console.log("================================================");
  console.log("PASTE Lottery Contract Address In app.constants.ts (2 files): " + Lottery.address);
  console.log("================================================")
};
