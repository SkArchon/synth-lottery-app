import { Controller, Get, Query } from '@nestjs/common';
import {from, Observable} from "rxjs";
import { AppService } from './app.service';
import { LotteryDrawService } from './lotter-draw.service';
import {MessagePattern} from "@nestjs/microservices";

@Controller()
export class AppController {

  constructor(private readonly appService: AppService, private readonly lotteryDrawService: LotteryDrawService) {}

  @Get("/lottery-draws")
  async getLotteryDraws(@Query('page') page: string, @Query('limit') limit: string) {
    const processedPage = (page) ? Number(page) : 1;
    const processedLimit = (limit) ? Number(limit) : 1000;
    const result = await this.lotteryDrawService.findAll(processedPage, processedLimit);
    return result;
  }

  @MessagePattern("LotteryDrawRan")
  public async lotteryDrawRan(lotteryDrawEventDetails: any) {
    console.log('STARTING');
    const result = await this.lotteryDrawService.create(lotteryDrawEventDetails);
    console.log('SUCCESS');
    console.log(result);
  }

}
