import { Component } from '@angular/core';
import { ContractService } from '../service/contract.service';
import { Store } from '@ngrx/store';
import { getAccountAddress, getAccountAddressShortened } from '../store/selectors/users.selectors';
import { interval, Observable, of, Subject } from 'rxjs';
import { logoutUser } from '../store/reducers/user.reducer';
import { switchMap, tap, withLatestFrom } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'application';

  public accountAddress$: Observable<string>;
  public remainingTime$ = new Subject<any>();

  constructor(private contractService: ContractService, private store: Store) {
    this.accountAddress$ = this.store.select(getAccountAddressShortened);
  }

  public signIn(): any {
    this.contractService.connectWallet();
  }

  public logout(): any {
    this.store.dispatch(logoutUser());
  }

  public startDraw(): any {
    of({}).pipe(
      withLatestFrom(this.accountAddress$),
      switchMap(([_, accountAddress]) => {
        return this.contractService.getLotteryContract()
          .methods
          .startDraw(1234)
          .send({ from: '0xb4214cd6B2CF82Eed431e0e679aB242c797dd91D' });
      })
    ).subscribe(result => {
      console.log(result);
    });
  }


}
