import { Component, OnDestroy } from '@angular/core';
import { ContractService } from '../service/contract.service';
import { Store } from '@ngrx/store';
import { getAccountAddress, getAccountAddressShortened } from '../store/selectors/users.selectors';
import { interval, Observable, of, Subject } from 'rxjs';
import { logoutUser } from '../store/reducers/user.reducer';
import { catchError, filter, map, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs/operators';
import { getIsDrawDatePassed, getNextDrawTimestamp } from 'app/store/selectors/lottery.selectors';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DateTime } from 'luxon';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnDestroy {

  public startDraw$ = new Subject<void>();

  public accountAddress$: Observable<string>;

  public remainingTime$ = new Subject<any>();
  public unsubscriber$ = new Subject<any>();

  constructor(private contractService: ContractService,
              private snackBar: MatSnackBar,
              private store: Store) {
    this.accountAddress$ = this.store.select(getAccountAddressShortened);
    this.setupStartDraw();
  }

  public signIn(): any {
    this.contractService.connectWallet();
  }

  public logout(): any {
    this.store.dispatch(logoutUser());
  }

  public setupStartDraw(): any {
    this.startDraw$.pipe(
      takeUntil(this.unsubscriber$),
      withLatestFrom(this.store.select(getNextDrawTimestamp)),
      map(([_, timestamp]) => {
        if (!timestamp) {
          return false;
        }

        const dateTimestamp = DateTime.fromSeconds(timestamp);
        const difference = dateTimestamp.diffNow('minutes').toObject().minutes;

        if (difference < -30) {
          const confirmResult = confirm('A backend service was expected to run this draw, if you still want to proceed. Click ok.');
          return confirmResult;
        } else if (difference <= 0) {
          this.snackBar.open(
            'A backend service is expected to run within the next 30 minutes to process the draw, please try again in 30 minutes.',
            'Close', {
            panelClass: ['failure-snackbar']
          });
          return false;
        }
        else {
          this.snackBar.open('The draw has time remaining, you need to wait till the draw is expired.', 'Close', {
            panelClass: ['failure-snackbar']
          });
          return false;
        }
      }),
      filter(result => result),
      withLatestFrom(this.store.select(getAccountAddress)),
      switchMap(([_, accountAddress]) => {
        return this.contractService.getLotteryContract()
          .methods
          .startDraw(1234)
          .send({ from: accountAddress });
      }),
      tap(_result => {
        this.snackBar.open('Draw process initiation transaction sent successfully.', 'Close');
      }),
      catchError(_error => {
        this.snackBar.open('An error occurred when trying to send the draw initiation transaction.', 'Close', {
          panelClass: ['failure-snackbar']
        });
        return of(false);
      })
    ).subscribe();
  }

  ngOnDestroy(): void {
    this.unsubscriber$.next();
    this.unsubscriber$.complete();
  }


}
