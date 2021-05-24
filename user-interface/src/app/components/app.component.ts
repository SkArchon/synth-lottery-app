import { Component } from '@angular/core';
import { ContractService } from '../service/contract.service';
import { Store } from '@ngrx/store';
import { getAccountAddress, getAccountAddressShortened } from '../store/selectors/users.selectors';
import { interval, Observable, of, Subject } from 'rxjs';
import { logoutUser } from '../store/reducers/user.reducer';
import { filter, map, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { getIsDrawDatePassed } from 'app/store/selectors/lottery.selectors';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'application';

  public accountAddress$: Observable<string>;
  public remainingTime$ = new Subject<any>();

  constructor(private contractService: ContractService,
              private snackBar: MatSnackBar,
              private store: Store) {
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
      withLatestFrom(this.store.select(getIsDrawDatePassed)),
      map(([_, result]) => {
        if (!result) {
          this.snackBar.open('The draw has time remaining, you need to wait till the draw is expired.', 'Close', {
            panelClass: ['failure-snackbar']
          });
          return false;
        }
        const confirmResult = confirm('A backend service is expected to run this draw, if you still want to proceed. Click ok');
        return confirmResult;
      }),
      filter(result => result),
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
