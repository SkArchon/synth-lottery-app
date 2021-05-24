import { Injectable } from '@angular/core';
import Web3 from 'web3';
import Web3Modal from 'web3modal';
import { from, fromEvent, of, Subject } from 'rxjs';
import { filter, map, switchMap, take, takeUntil, withLatestFrom } from 'rxjs/operators';
import WalletConnectProvider from '@walletconnect/web3-provider';
import USDContract from 'contracts/SynthUsd.json';
import LotteryContract from 'contracts/Lottery.json';
import { DateTime } from 'luxon';
import { Store } from '@ngrx/store';
import { logoutUser, setAccountAddress } from '../store/reducers/user.reducer';
import { CONTRACT_ADDRESS, PROVIDER_URL, USD_ADDRESS } from '../app.constants';
import { getAccountAddress } from '../store/selectors/users.selectors';
import { checkForWinnings, loadCurrentContractAllowance, loadUserBalance } from '../store/reducers/lottery.reducer';
import { CommonUtil } from 'app/common.util';
import { loadUserTickets } from 'app/store/reducers/user-ticket.reducer';

@Injectable({
  providedIn: 'root'
})
export class ContractService {
  private web3js: any;
  private provider: any;
  private web3Modal;

  private lotteryContract = null;
  private sUsdContract = null;

  private accountStatusSource = new Subject<any>();
  accountStatus$ = this.accountStatusSource.asObservable();

  logoutEvent$ = new Subject<void>();

  constructor(private store: Store) {
    this.setupWeb3Modal();
    this.processAlternativeProvider();

    this.store.select(getAccountAddress)
      .pipe(
        take(1),
        filter(address => !!address)
      )
      .subscribe(_ => {
        this.connectWallet();
      });
  }

  private setupWeb3Modal(): void {
    // You can add other wallet providers here (which will result in a popup)
    const providerOptions = {};

    this.web3Modal = new Web3Modal({
      network: 'mainnet', // optional
      cacheProvider: true, // optional
      providerOptions, // required
    });
  }

  async connectWallet(): Promise<void> {
    await this.processProvider();
    this.initializeContracts();
  }

  async processProvider(): Promise<void> {
    try {
      this.provider = await this.web3Modal.connect(); // set provider
      this.web3js = new Web3(this.provider); // create web3 instance
      this.initializeContracts();

      const accounts = await this.web3js.eth.getAccounts();
      if (accounts.length > 0) {
        this.store.dispatch(setAccountAddress({ accountAddress: accounts[0] }));
        this.store.dispatch(loadCurrentContractAllowance({ accountAddress: accounts[0] }));
        this.store.dispatch(loadUserBalance({ accountAddress: accounts[0] }));
        this.store.dispatch(loadUserTickets());
        this.store.dispatch(checkForWinnings());
        this.setupListeners();
      }
    }
    catch (e) {
      // We leave the provider null => no event listners
      this.processAlternativeProvider();
    }
  }

  private async processAlternativeProvider(): Promise<void> {
    const provider = new Web3.providers.HttpProvider(PROVIDER_URL);
    this.web3js = new Web3(provider); // create web3 instance
    this.initializeContracts();
  }

  private setupListeners(): void {
    if (!this.provider) {
      return;
    }

    // Subscribe to accounts change
    fromEvent(this.provider, 'accountsChanged')
      .pipe(takeUntil(this.logoutEvent$))
      .subscribe((accounts: string[]) => {
        this.store.dispatch(logoutUser());
        location.reload();
      });

    fromEvent(this.provider, 'chainChanged')
      .pipe(takeUntil(this.logoutEvent$))
      .subscribe((chainId: number) => {
        this.store.dispatch(logoutUser());
        location.reload();
      });

    // Subscribe to provider connection
    fromEvent(this.provider, 'connect')
      .pipe(takeUntil(this.logoutEvent$))
      .subscribe((info: { chainId: number }) => {
        console.log(info);
      });

    // Subscribe to provider disconnection
    fromEvent(this.provider, 'disconnect')
      .pipe(takeUntil(this.logoutEvent$))
      .subscribe((error: { code: number; message: string }) => {
        this.store.dispatch(logoutUser());
        location.reload();
      });
  }

  private initializeContracts(): void {
    this.lotteryContract = new this.web3js.eth.Contract(LotteryContract.abi, CONTRACT_ADDRESS);
    this.sUsdContract = new this.web3js.eth.Contract(USDContract.abi, USD_ADDRESS);
  }

  public getLotteryContract(): any {
    return this.lotteryContract;
  }

  public getUsdContract(): any {
    return this.sUsdContract;
  }

  public clearProvider() {
    this.web3Modal.clearCachedProvider();
    this.processAlternativeProvider();
  }

  // public getUserBalance() {
  //   return of({}).pipe(
  //     withLatestFrom(this.store.select(getAccountAddress)),
  //     filter(([_, accountAddress]) => !!accountAddress),
  //     switchMap(([_, accountAddress]) => {
  //       const promise$ = this.sUsdContract
  //         .methods
  //         .balanceOf(accountAddress)
  //         .call();
  //       return from(promise$);
  //     }),
  //     map((amount: string) => {
  //       return CommonUtil.getNumber(String(amount));
  //     })
  //   );
  // }

}
