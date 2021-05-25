# Synthetix Lottery
![screenshot](https://user-images.githubusercontent.com/83293842/119379307-f5f17080-bcdc-11eb-84b1-3bf0ebe80eb4.png)

# Overview

This is a submission for the gitcoin bounty https://gitcoin.co/issue/snxgrants/open-defi-hackathon/8/100025689 

The application uses a monorepo architecture where
* Backend-listener-service
  Service that listens to the contract for events to create draw events. It also does cron scheduling (which we will discuss later).

* contracts
  Contains all of the code for the contracts, uses truffle. Use ./deploy_kovan.sh to deploy to kovan. (The secret has been committed, don't use it for public transactions).

* user-interface
  A frontend application written in Angular.

Click the following (https://youtu.be/5K5kpaddMsw) to view the recording.
[![Demonstration](https://img.youtube.com/vi/5K5kpaddMsw/0.jpg)](https://youtu.be/5K5kpaddMsw)


# Functionality 

### Getting Into the Application

Before a user logs into the application with his wallet, we use a separate infura provider for non logged in users. When the user clicks the Signin button, the user can be provided multiple options of logging in (In the demo we only have set one though).

This is as we use the web3modal library, currently we have not configured any multiple options for Demo purposes. But the option is there.


After the user logs in, we use the account Id to get additional information. Namely the balance and the contract approval amount. All of this data is stored in a redux style store (ngrx in angular). Which allows for high synchronity.

The draw tracker is set to countdown until the timer is hit.

### Purchasing a ticket - approval

Before a user purchases a ticket, the user must approve the ticket first so our contract can transfer funds on behalf of the user. We allow the user to approve more than the purchase amount considering future transactions to reduce gas fees.

We open a popup for the approval process. If the user cancels the popup OR rejects the metamask transaction, we will cloes the popup and show an error message. However If the user approves the transaction, we will show a spinner. This spinner will be shown until the transaction is complete.

```
** Practical Issue **
While this is a non issue on a local blockchain or even on the kovan testnet. This was identified as a potential issue, if the network is clogged the blockchain, there would be a seemingly infinite spinner, which is bad UX. As a result, before this is moved in to production a different solution should be thought of.

One solution is to have a notification bar and listen for events (in case of page reload, we will need to persist the events that we are expecting). This will allow us to be transparent with the user while allowing the user to use the application.

Popups are used in almost all actions (claim, approve, purchase)
```

For the approve function we directly call the ERC20 interface, and call approve.

### Purchasing a ticket - purchase

If an approve popup was there, after the popup closes for the user. If not and the user already was approved, we skip the approve step right to here. Again simply a popup will open while the buy transaction is being executed.

In this case we call the buy method on our Lottery contract. Which has a few validations, we pass the draw number from the front (just in case someone somehow is on an outdated draw). Next the lottery cannot be already processing and the purchase block timestamp is within the required range.
There is also a max limit on the number of tickets available to purchase in one tx. This is to prevent huge gas costs if a user buys million tickets at once!

(More on timestamps later)

When the first purchase happens we set the startTokenId (which we will be using to calculate the number of particpants in a particular).

### Running the draw

The contract is made so that anyone can call the contract to initate the draw, so in case the administrator has gone missing and the service is in limbo. Anyone can initiate, as long as the time criteria has been met.

While researching on time, it seems that the blocktimestamp is not reliable and manipulatable. (https://ethereum.stackexchange.com/questions/6795/is-block-timestamp-safe-for-longer-time-periods) In this case though, its manipulatable within a certain range. So any checks we do is outside this range.

So if a user wants to initiate a lottery, we check if the time the user called is within about 30 mins of the actual draw timestamp.


However in our current case until the admin goes missing! We have a centralized (yes, centralized) service / cron service that will initiate the draw. I was unable to find how crons could be changed dynamically. So for now I have a 30 second cron that checks if the server time (the server time should always be in UTC) has passed the draw timestamp in the contract. If so the cron will initiate a draw.

I looked at ethereum alarm clock, however their github seemed inactive since 3 years (https://github.com/ethereum-alarm-clock/ethereum-alarm-clock). On top of that I came across chainlinks own alarm clock (https://github.com/ethereum-alarm-clock/ethereum-alarm-clock). However upon checking on the chainlink discord, the adapter is experimental still (https://docs.chain.link/docs/adapters/#sleep).
 So thus while ideally chainlim alarm clock would be suited to make an even more decentralized app! We went with the centralized solution which is in our control. However this can be migrated when the sleep adapter is not marked as experimental.

**Randomness**

When a draw is initiated, no one can actually call the actual draw method. Due to the `vrfCoordinatorAddressForCheck` check. Only the VRF co-ordinator can actually call this method.

We pass in a custom seed from oour cron application, which in turn gets passed again to the `requestRandomness` function. Which sends it to Chain Link to handle and get back to our contract with a true random value.

However it should be noted, in cases where there are *zero* participants, we skip the chain link call since it is expensive. We however do still send the call even if there is one particpant right now.


**Picking The Winner**

The winner is picked by finding the participant amount (by substracting latestToken - startToken) since the token Ids are incremental. Using this we loop for the required number of times (depending on the winning percentages). We also use a single random number to generate more random numbers (since the original is passed to us by ChainLink, we rely on that as the seed).


**Lottery History**

We use lottery events to read events through our backend service to a MongoDb database. While this is centralised, this dataset is by no means the source of truth. And acts only as a way to demonstrate a caching mechanism to increase performacne and usability.

For example the loading of the user tickets is done directly in the contract, however in cases where there are millions of tickets purchased by the user, this would take very long. On top of that there is no way to figure out which draw the ticket was associated with. On a chacing layer this would be possible by detecting the current draw when the event comes in.

So in summary in my opinion, centralization isnt bad as long as it is not the source of truth. I believe lots of other dapps (cryptokitties, etherscan, etc) does this.


## Misc Notes

The Draw is setup so that once its ongoing no one, not even the admin can influence any of the main components (Draw end time and ticket price).
This is done by having a separate variable for the admin to set, which will be used to refresh the actual variable when a draw is run.
The admin can change the active winning percentages right now(but this too can be changed if needed).

The current time duration for a draw is set to 8 mins, with the initial draw set to 5 minutes. This is so that it is easy to test. We can easily set this to 6 hours or 1 week by modifying Line 30 and/or line 57 in `Lottery.sol`.

The project has been setup with most of the keys and secrets committed. These are throwaway items that were committed to make it easy for reviewers.

# Issues (Known and Potential)
 
There was an issue where after certain async tasks ran (like loading winner details after a draw has run without refreshing the page) where if you try to submit a transaction an error would happen. This was because the provider was getting reset to the Infura provider. However this has been fixed, while unlikely due to lack of time to test, it maybe could occur through other patterns. In this case please try refreshing the page and doing the action again.

Likewise, there could be missing permutations where a certain dataset that needed to be reloaded **asynchronously** after a certain action was not coded in.

On the lottery draw page, the display limit is currently capped to 10. However the backend has been written in a fashion capable of pagination. The plan was to allow infinite scrolling to demonstrate how centralized apps could help with UX, but due to lack of time this was not possible.

Draws can overlap, where multiple draws have elapsed. What I mean is, lets say a draw last 5 minutes, however draw #1 which was supposed to be processed at 5 PM was not processed yet. When the seheduler is started back up at 6 PM the next draw time will be 5:05 PM which is still in the past. This is less unlikely when the draw is processed once per week, but still possible. Logic needs to be added to set the time to the most recent draw in the future.

# Further Improvements

One major improvement point is to make the contract self sustainable, this can be done by using Uniswaps Router (https://uniswap.org/docs/v2/smart-contracts/router02/) or some similar contract. To exchange sUSD for Link. This way the contract can be self sustained.
Additionally a similar mechanism could be used so that ether may be sent to the address that is used by the backend scheduler so it does not run out of funds for the transaction fee each time it calls the function that initiates the draw.

Mobile viewports breaks the UI a bit (especially on the home page), currently approximately tab displays and larger would display correctly.

Fix the draw overlap bug mentioned above.

There is a mix of BEM css and non BEM css along with css classes duplicated and spread between files, these need to be refactored.

Allow user to continue using the app without waiting for transaction confirmations, by changing the overall design.

# Project Setup

### Method using helper scripts

Run the following from the root directory, if you look at the root directory package.json it has a setup of helper scripts.
```
npm run install-all
```

Open up the file `2_migrate.js` and update the `sUsdAddress` if required. (or any similar ERC20 token).

Then run (skip to next for windows / environments that cant run bash scripts)
 
```
npm run deploy-contract-kovan
```

** windows only ** If you are on Windows you may not be able to run the above, try doing the following.
*Also take a look at deploy_kovan.sh*
1. Go into the folder of "contracts"
2. Clean the build folder (`contracts/build`)
3. Run `truffle migrate --compile-all --network kovan`
4. Remove everything in `user-interface/src/contracts/*`
5. Copy everything in `build/contracts/*` to `user-interface/src/contracts/`

Copy the outputted contract address (should look like below) (For windows users this will be after the `truffle migrate` command)

```
================================================
PASTE Lottery Contract Address In app.constants.ts (2 files): 0xF199FFb9Cbc5a35647d0641e51fcA45090ca52f0
================================================
```

Then a link kovan faucet page will open up, make sure to fund the contract with link (for the draw).

Next search for `<<REPLACE_ADDRESS>>`. Here repalce the contract address. (Alternatively if you used a different sUSD contract address, make sure to replace it in the `user-interface` `USD_ADDRESS` variable value). The files that you need to change are in app.constants.ts (2 files of the same name).

And finally run

```
# This runs both client and listener service in same terminal, if you wish to do it in separate terminals, run the individual commands separately
start-services
```

Note: Please consider setting a local/different url for mongodb, or there can be multiple hosts pushing to the same repository
Search for "MONGODB_URL" (in app.constants.ts)

Go to http://localhost:4200, if everything was deployed correctly, you should get the page in the above screenshot (or similar).

The backend service should output `Returning result ` if connection to the contract was successful (task.service.ts, line 70).

# Final Thoughts
Working on this was stressful but fun as it was my first Dapp and foray into the Web3 ecosystem. Any feedback on improvements is most welcome.
