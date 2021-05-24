import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CronExpression } from '@nestjs/schedule';
import { ADMIN_ADDRESS, CONTRACT_ADDRESS, INFURA_KEY, INFURA_URL, NETWORK, PRIVATE_KEY } from './app.constants';
const Web3 = require('web3');
const Provider = require('@truffle/hdwallet-provider');
import {LOTTERY_CONTRACT} from './contracts/Lottery';
const { DateTime } = require("luxon");
const crypto = require('crypto');
var converter = require('hex2dec');

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  private web3;
  private lotteryContract;

  constructor() {
    const provider = new Provider(PRIVATE_KEY, INFURA_URL); 
    this.web3 = new Web3(provider);
    this.lotteryContract = new this.web3.eth.Contract(LOTTERY_CONTRACT.abi, CONTRACT_ADDRESS);
  }

  // This is 30 seconds for testing, ideally should be 5 minutes
  @Cron(CronExpression.EVERY_30_SECONDS) 
  private async processDraw() {
    try {
      console.log(this.web3.eth.accounts[0]);
      this.logger.log("Starting draw run check");
      const runDraw = await this.isDurationPassed();
      
      if(runDraw) {
        this.logger.log("Running draw");
        const seed = this.getSeed();

        const nonce = await this.web3.eth.getTransactionCount(ADMIN_ADDRESS);
        console.log("Running using the nonce value : " + nonce);

        const response = await this.lotteryContract
          .methods
          .startDraw(seed)
          .send({ from: ADMIN_ADDRESS, nonce: nonce });

        this.logger.log("Running draw successful :" + response.transactionHash);
      }
    }
    catch(e) {
      this.logger.error("An error occurred while starting the draw", e);
    }
  }

  private getSeed() {
    const bytes = crypto.randomBytes(16);
    const decimal = converter.hexToDec(bytes.toString('hex'));
    return decimal;
  }

  private async isDurationPassed() {
    try {
      const serverData = await this.lotteryContract
          .methods
          .getDetails()
          .call();

      if (!serverData.timestamp) {
        this.logger.error('An error occurred when getting the timestamp');
        return false;
      }
      const drawTimestampUtc = DateTime.fromSeconds(Number(serverData.timestamp));

      const difference = drawTimestampUtc.diffNow().toObject().milliseconds;
      const result = difference < 0;
      
      this.logger.debug("Returning result " + result);
      return result;
    }
    catch(e) {
      this.logger.error("Unable to check if draw time is passed", e);
      return false;
    }
  }
    
 
}



