import {CustomTransportStrategy, MessageHandler, Server, Transport} from "@nestjs/microservices";


//@deprecated
export class ContractEventListener extends Server implements CustomTransportStrategy {

  public listen(callback: () => void): void {
    callback();
  }

  close() {
  }


}


