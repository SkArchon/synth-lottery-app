import { Component, OnDestroy, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { ContractService } from 'app/service/contract.service';
import { approveContract, loadCurrentContractAllowance, loadUserBalance, lotteryLoadData } from 'app/store/reducers/lottery.reducer';
import { getDateStringToNextDraw, getDrawNumber, getDrawPool, getLoadingState, getLotteryAllowance, 
  getLotteryAllowanceFormatted, getNextDrawTimestamp, getDrawPoolFormatted, getTicketPrice, getTicketPriceFormatted, getHasWinnings, getUserBalance, getIsDrawDatePassed } from 'app/store/selectors/lottery.selectors';
import { BehaviorSubject, combineLatest, forkJoin, from, interval, Observable, of, Subject } from 'rxjs';
import { catchError, filter, map, mergeMap, startWith, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs/operators';
import { DateTime } from 'luxon';
import { getDuraionToNextDraw, getIsDrawDateValuePassed } from 'app/store/selectors/helpers';
import { animate, style, transition, trigger } from '@angular/animations';
import {MatDialog} from '@angular/material/dialog';
import { ApproveDialogComponent } from '../approve-dialog/approve-dialog.component';
import { AbstractControl, AsyncValidatorFn, FormBuilder, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { CommonUtil } from 'app/common.util';
import { MatSnackBar } from '@angular/material/snack-bar';
import { getAccountAddress } from 'app/store/selectors/users.selectors';
import { loadLotteryDraws } from 'app/store/reducers/lottery-draws.reducer';
import * as lotteryDrawSelectors from 'app/store/selectors/lottery-draws.selectors';
import * as userTicketSelectors from 'app/store/selectors/user-ticket.selectors';
import { loadUserTickets } from 'app/store/reducers/user-ticket.reducer';
import { ProgressDialogComponent } from '../progress-dialog/progress-dialog.component';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  animations: [
    trigger('enterAnimation', [
      transition(':enter', [style({ opacity: 0 }), animate('500ms', style({ opacity: 1 }))]),
  ]),
  ]
})
export class HomeComponent implements OnDestroy {

  public unsubscriber$ = new Subject<any>();
  public remainingTime$ = new Subject<any>();
  public purchaseSubmit$ = new Subject<void>();
  public isDrawDatePassed$ = new Subject<boolean>();

  // This should be the same as in the contract
  // since both are constants we dont retrieve them from the contract
  public readonly maxTicketsPerPurchase = 100;

  public dateString$;
  public loadingState$;
  public drawNumber$;
  public drawPoolFormatted$;
  public ticketPrice$: Observable<number>;
  public ticketPriceFormatted$;
  public caluclatedPrice$;
  public hasWinnings$;
  public lotteryAllowance$: Observable<number>;
  public lotteryAllowanceFormatted$;
  public accountAddress$;

  public lotteryDrawLoadingState$;
  public draws$;

  public userTicketsLoadingState$;
  public userTickets$;

  public userBalance$;

  // workaround since async validator didnt work with withLatestFrom
  public userBalanceValue = null;
  public ticketPriceValue = null;

  public buyForm: FormGroup;

  constructor(private contractService: ContractService,
              private snackBar: MatSnackBar,
              private store: Store,
              public dialog: MatDialog,
              formBuilder: FormBuilder) {
    this.store.dispatch(lotteryLoadData());
    this.store.dispatch(loadUserTickets());
    this.store.dispatch(loadLotteryDraws());

    this.dateString$ = this.store.select(getDateStringToNextDraw);
    this.drawNumber$ = this.store.select(getDrawNumber);
    this.drawPoolFormatted$ = this.store.select(getDrawPoolFormatted);
    this.ticketPrice$ = this.store.select(getTicketPrice);
    this.ticketPriceFormatted$ = this.store.select(getTicketPriceFormatted);
    this.lotteryAllowance$ = this.store.select(getLotteryAllowance);
    this.lotteryAllowanceFormatted$ = this.store.select(getLotteryAllowanceFormatted);
    this.hasWinnings$ = this.store.select(getHasWinnings);
    this.userBalance$ = this.store.select(getUserBalance);
    this.accountAddress$ = this.store.select(getAccountAddress);

    this.draws$ = this.store.select(lotteryDrawSelectors.getFirstThreeDraws);
    this.lotteryDrawLoadingState$ = this.store.select(lotteryDrawSelectors.getLoadingState)
      .pipe(startWith('pending'));

    this.userTickets$ = this.store.select(userTicketSelectors.getFirstThreeTickets);
    this.userTicketsLoadingState$ = this.store.select(userTicketSelectors.getLoadingState)
       .pipe(startWith('pending'));

    this.loadingState$ = this.store.select(getLoadingState)
      .pipe(startWith('pending'));

    this.userBalance$.subscribe((userBalanceAsValue) => {
      this.userBalanceValue = userBalanceAsValue;
    });

    this.ticketPrice$.subscribe((ticketPriceValue) => {
      this.ticketPriceValue = ticketPriceValue;
    });

    this.getDurationUpdater().subscribe(this.remainingTime$);
    this.getIsDrawDateValuePassedUpdater().subscribe(this.isDrawDatePassed$);

    this.getIsDrawDateValuePassedUpdater(20000).pipe(
      filter(result => result),
      tap(_ => {
        this.store.dispatch(lotteryLoadData());
        this.store.dispatch(loadUserTickets());
        this.store.dispatch(loadLotteryDraws());
      })
    ).subscribe();

    this.buyForm = formBuilder.group({
      ticketCount: new FormControl(1, [
        Validators.required,
        Validators.max(this.maxTicketsPerPurchase),
        this.numberValidator(),
        this.wholeNumberValidator()
      ],
      [this.balanceExceeded()]),
    });

    this.caluclatedPrice$ = this.buyForm.controls.ticketCount.valueChanges.pipe(
      startWith(this.buyForm.controls.ticketCount.value),
      withLatestFrom(this.ticketPrice$),
      map(([ticketCount, ticketPrice]) => {
        const ticketCountNumber = Number(ticketCount);
        if ((isNaN(ticketCountNumber) || ticketCountNumber < 0) ) {
          return CommonUtil.formatAmount(0.00);
        }
        return (ticketCount.toString().indexOf('.') > -1)
          ? CommonUtil.formatAmount(0.00)
          : CommonUtil.formatAmount((ticketCountNumber * ticketPrice));
      })
    );

    this.setupBuyButton();
  }



  private setupBuyButton() {
    this.purchaseSubmit$.pipe(
      takeUntil(this.unsubscriber$),
      withLatestFrom(this.store.select(getAccountAddress)),
      filter(([_, accountAddress]) => {
        if (accountAddress) {
          return true;
        }
        this.snackBar.open('Please sign in using the "Sign In" button at the top right hand corner first', 'Close', {
          panelClass: ['failure-snackbar']
        });
        return false;
      }),
      filter(_ => {
        this.buyForm.markAllAsTouched();

        if (this.buyForm.invalid) {
          this.snackBar.open('Please make sure to enter a valid amount', 'Close', {
            panelClass: ['failure-snackbar']
          });
        }

        return !this.buyForm.invalid;
      }),
      switchMap(_ => {
        return of({}).pipe(
          withLatestFrom(this.drawNumber$),
          switchMap(([_v, localDrawNumber]) => {
            const promise = this.contractService.getLotteryContract()
              .methods
              .getDetails()
              .call();

            return from(promise).pipe(
              map((result: any) => {
                return (Number(localDrawNumber) === localDrawNumber)
                  ? 'success'
                  : 'failure';
              }),
              catchError(_error => {
                return of('error');
              })
            );
          })
        );
      }),
      filter(result => {
        switch (result) {
          case 'error':
            this.snackBar.open('An unexpected exception happened when validating the draw.', 'Close', {
              panelClass: ['failure-snackbar']
            });
            return false;
          case 'failure':
            this.snackBar.open('It seems like the draw has expired, please refresh and purchase.', 'Close', {
              panelClass: ['failure-snackbar']
            });
            return false;
          default:
            return true;
        }
      }),
      withLatestFrom(this.lotteryAllowance$, this.ticketPrice$),
      switchMap(([_, lotteryAllowance, ticketPrice]) => {
        // Verify if the contract approval is done
        const ticketCount =  this.buyForm.controls.ticketCount.value;
        const priceTotal = ticketCount * ticketPrice;
        if (lotteryAllowance >= priceTotal) {
          return of(true);
        }

        const approvalMinPrice = priceTotal;
        const dialogRef = this.dialog.open(ApproveDialogComponent, {
          data: { approvalMinPrice }
        });

        return dialogRef.afterClosed().pipe(
            map(result => (result && (result.approvedAmount + lotteryAllowance >= priceTotal)))
          );
      }),
      tap(result => {
        if (!result) {
          this.snackBar.open('We were unable to approve the required min amount. Please refresh and try agian.', 'Close', {
            panelClass: ['failure-snackbar']
          });
        }
      }),
      filter(result => result),
      withLatestFrom(this.store.select(getAccountAddress), this.drawNumber$),
      mergeMap(([_, accountAddress, drawNumber]) => {
        const ticketCount = this.buyForm.controls.ticketCount.value;

        const promise = this.contractService.getLotteryContract().methods
          .buyTicket(ticketCount, drawNumber)
          .send({ from: accountAddress });

        const obs$ = of({}).pipe(
          mergeMap(() => from(promise)),
          tap(_success => {
            setTimeout(() => {
              this.snackBar.open(`${ticketCount} Tickets Were Successfully Purchased`, 'Close');
              this.store.dispatch(lotteryLoadData());
              this.store.dispatch(loadCurrentContractAllowance({ accountAddress }));
              this.store.dispatch(loadUserBalance({ accountAddress }));
              this.store.dispatch(loadUserTickets());
            }, 1000);
          }),
          catchError(_error => {
            setTimeout(() => {
              this.store.dispatch(lotteryLoadData());
              this.store.dispatch(loadCurrentContractAllowance({ accountAddress }));
              this.store.dispatch(loadUserBalance({ accountAddress }));
              this.store.dispatch(loadUserTickets());
            }, 1000);

            this.snackBar.open('We were unable to buy the tickets required', 'Close', {
              panelClass: ['failure-snackbar']
            });
            return of(false);
          })
        );

        const dialogRef = this.dialog.open(ProgressDialogComponent, {
          data: {
            header: 'Purchasing Tickets',
            observable: obs$,
            message: 'Purchasing Tickets'
           }
        });
        return dialogRef.afterClosed();
      })
    )
    .subscribe();
  }

  private getDurationUpdater() {
    return interval(1000).pipe(
      takeUntil(this.unsubscriber$),
      withLatestFrom(this.store.select(getNextDrawTimestamp)),
      filter(([_, result]) => !!result),
      map(([_, timestamp]) => getDuraionToNextDraw(timestamp))
    );
  }

  private getIsDrawDateValuePassedUpdater(intervalValue: number = 1000) {
    return interval(intervalValue).pipe(
      takeUntil(this.unsubscriber$),
      withLatestFrom(this.store.select(getNextDrawTimestamp)),
      map(([_, timestamp]) => getIsDrawDateValuePassed(timestamp))
    );
  }

  public formatAmount(value): string {
    return CommonUtil.formatAmount(value);
  }

  public formatAmountFromWei(value): string {
    return CommonUtil.formatAmount(CommonUtil.getNumber(value));
  }

  public formatDate(timestamp): string {
    return DateTime.fromSeconds(timestamp).toFormat('yyyy LLL dd');
  }

  private balanceExceeded(): AsyncValidatorFn {
    return (control: AbstractControl): Observable<ValidationErrors | null> => {
      return of({}).pipe(
        map((_) => {
          const value = Number(control.value);
          if (isNaN(value) || (!this.userBalanceValue && this.userBalanceValue !== 0) || !this.ticketPriceValue) {
            return null;
          }
          const balanceExceeded = (value * this.ticketPriceValue) > this.userBalanceValue;
          return (balanceExceeded) ? { balanceExceeded: true } : null;
        }),
        catchError(() => {
          return of(null);
        })
      );
    };
  }

  numberValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const numberValue = Number(control.value);
      return (isNaN(numberValue) || numberValue < 0) ? {notNumber: true} : null;
    };
  }

  wholeNumberValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const numberValue = Number(control.value);
      if (!(isNaN(numberValue) || numberValue < 0)) {
        return (control.value.toString().indexOf('.') > -1) ? { notWholeNumber: true } : null;
      }
      return null;
    };
  }


  ngOnDestroy(): void {
    this.unsubscriber$.next();
    this.unsubscriber$.complete();
  }

}
