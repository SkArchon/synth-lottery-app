import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CONTRACT_ADDRESS, INFURA_KEY } from './app.constants';
import { LotteryDraw, LotteryDrawDocument } from './lottery-draw.schema';
import { AppMetadata, AppMetadataDocument } from './app-metadata.schema';

const { ethers } = require("ethers");
import {LOTTERY_CONTRACT} from './contracts/Lottery';
import { CommonUtil } from './common-util';

@Injectable()
export class LotteryDrawService implements OnModuleInit {

  private lotteryContract;
  private readonly logger = new Logger(LotteryDrawService.name);

  constructor(
    @InjectModel(LotteryDraw.name) private lotteryDrawModel: Model<LotteryDrawDocument>,
    @InjectModel(AppMetadata.name) private appMetadataModel: Model<AppMetadataDocument>
  ) {}

  async onModuleInit() {
    // TODO : Upgrade to proper app logger (for proper logs)
    // Logger unfortunately does not seem to work in these cases
    // so defaulted to console.log (better than no logs at all)
    console.log("Listening Started");
    const provider = new ethers.providers.InfuraProvider('kovan', INFURA_KEY);
    this.lotteryContract = new ethers.Contract(CONTRACT_ADDRESS, LOTTERY_CONTRACT.abi, provider);
    
    try {
      const latestBlock = await provider.getBlock("latest");
      await this.loadPendingData(latestBlock);
    }
    catch(e) {
      console.log("An error occurred while processing these data", e);
    }

    this.setupEvent();
  }

  private setupEvent() {
    console.log("Setting up event");
    this.lotteryContract.on("LotteryDraw", async (_from, _to, _amount, event) => {
      try {
        console.log("Processing event for block number " + event.blockNumber);
        const eventArgs = event.args;
        const processedEvent =  {
          drawNumber: Number(eventArgs.drawNumber.toString()),
          totalDrawPool: CommonUtil.getNumber(eventArgs.drawTotal.toString()),
          date: Number(eventArgs.drawTimestamp.toString())
        };
        await this.updateOrCreateLotteryDrawIfNotExists(processedEvent);
        await this.setBlockNumber(event.blockNumber);
      }
      catch(e) {
        console.log("An error occurred when processing an event " + e)
      }
    });
  }

  private async loadPendingData(latestBlock) {
    const currentSyncedBlock = await this.getCurrentSyncedBlock();
    let eventFilter = [this.lotteryContract.filters.LotteryDraw()];
    const results: any[] = await this.lotteryContract.queryFilter(eventFilter, currentSyncedBlock);

    const processedResults = results
      .filter(entry => entry.event === 'LotteryDraw')
      .map(entry => {
        const eventArgs = entry.args;
        const processedEvent =  {
          drawNumber: Number(eventArgs.drawNumber.toString()),
          totalDrawPool: CommonUtil.getNumber(eventArgs.drawTotal.toString()),
          date: Number(eventArgs.drawTimestamp.toString())
        };
        return processedEvent;
      });
    
    await this.updateBulkByOne(processedResults, latestBlock.number);
  }

  private async updateBulkByOne(lotteryDraws: any[], latestBlockNumber: number) {
    for(let lotteryDraw of lotteryDraws) {
      await this.updateOrCreateLotteryDrawIfNotExists(lotteryDraw);
    }
    await this.setBlockNumber(latestBlockNumber);
  }

  private async setBlockNumber(latestBlockNumber) {
    console.log("Setting block number " + latestBlockNumber);
    const saveData = { staticId: 1, currentBlockNumber: latestBlockNumber };
    const searchEntry = await this.appMetadataModel.findOne({ staticId: 1}).exec();
    if (searchEntry) {
      await this.appMetadataModel.findOneAndUpdate({ staticId: 1 }, saveData).exec();
    } else {
      const currentModel = new this.appMetadataModel(saveData);
      await currentModel.save();
    }     
  }

  private async updateOrCreateLotteryDrawIfNotExists(lotteryDraw) {
    const results = await this.lotteryDrawModel.find({ drawNumber: lotteryDraw.drawNumber }).exec();
    if(results.length === 0) {
      await this.create(lotteryDraw);
    } else {
      console.log("Lottery Draw Duplicate " + lotteryDraw.drawNumber + " Skipped");
    }
  }

  private async getCurrentSyncedBlock() {
    const result = await this.appMetadataModel.findOne({ staticId: 1}).exec();
    return (result)
      ? result.currentBlockNumber
      : 25015190; //0;
  }

  //==================
  // Public methods
  //==================
  
  async create(lotteryDraw) {
    const createLotteryDrawModel = new this.lotteryDrawModel(lotteryDraw);
    const result = await createLotteryDrawModel.save();
    return result;
  }

  async findAll(page: number, limit: number) {
    const processedPage = page - 1;
    const skipAmount = processedPage * limit;
    return await this.lotteryDrawModel.find()
      .sort({ "drawNumber": -1 })
      .limit(limit)
      .skip(skipAmount)
      .exec();
  }
}
