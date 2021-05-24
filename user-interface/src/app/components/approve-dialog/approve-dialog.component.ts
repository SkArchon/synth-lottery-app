import { Component, Inject, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { CONTRACT_ADDRESS } from 'app/app.constants';
import { ContractService } from 'app/service/contract.service';
import { loadCurrentContractAllowanceSuccess, loadUserBalance } from 'app/store/reducers/lottery.reducer';
import { getLotteryAllowance, getTicketPrice } from 'app/store/selectors/lottery.selectors';
import { getAccountAddress } from 'app/store/selectors/users.selectors';
import { BehaviorSubject, forkJoin, from } from 'rxjs';
import { take } from 'rxjs/operators';
import Web3 from 'web3';

@Component({
  selector: 'app-approve-dialog',
  templateUrl: './approve-dialog.component.html',
  styleUrls: ['./approve-dialog.component.scss']
})
export class ApproveDialogComponent implements OnInit {

  private usdContract;
  private ticketPrice;
  private accountAddress;
  private currentLotteryAllowance: number;

  public approvalMinPrice = 0;

  public approveForm: FormGroup;

  public submitLoader$ = new BehaviorSubject<string>('idle');

  constructor(contractService: ContractService,
              private store: Store,
              @Inject(MAT_DIALOG_DATA) data,
              private dialogRef: MatDialogRef<ApproveDialogComponent>,
              formBuilder: FormBuilder) {
    this.usdContract = contractService.getUsdContract();

    this.approvalMinPrice = data.approvalMinPrice;
    this.approveForm = formBuilder.group({
      approveAmount: new FormControl(this.approvalMinPrice, [Validators.required, this.minPriceValidator()]),
    });

    forkJoin([
      store.select(getTicketPrice).pipe(take(1)),
      store.select(getAccountAddress).pipe(take(1)),
      store.select(getLotteryAllowance).pipe(take(1))
    ])
    .subscribe(([ticketPrice, accountAddress, lotteryAllowance]) => {
      this.ticketPrice = ticketPrice;
      this.accountAddress = accountAddress;
      this.currentLotteryAllowance = lotteryAllowance;
    });
  }

  ngOnInit(): void {
  }

  approve() {
    this.approveForm.markAllAsTouched();

    if (!this.approveForm.invalid) {
      this.runApprove();
    }
  }

  async runApprove() {
    this.submitLoader$.next('pending');
    const amount = this.approveForm.controls.approveAmount.value;

    try {
      const weiAmount = Web3.utils.toWei(String(amount));
      await this.usdContract
          .methods
          .approve(CONTRACT_ADDRESS, weiAmount)
          .send({from: this.accountAddress});

      this.submitLoader$.next('success');

      setTimeout(_ => {
        const newApprovedAmount = amount + this.currentLotteryAllowance;
        this.store.dispatch(loadCurrentContractAllowanceSuccess({ contractAllowance: newApprovedAmount }));
        this.store.dispatch(loadUserBalance({ accountAddress: this.accountAddress }));

        this.dialogRef.close({ status: true, approvedAmount: amount });
      }, 1000);

      // TODO : What about eventual consistent / pending transactions then
      // if (transaction && transaction.events && transaction.events.Approve) {
      //   this.submitLoader$.next('success');
      // }
      // else {
      //   this.submitLoader$.next('partial-error');
      // }
    }
    catch (e) {
      this.submitLoader$.next('error');
    }
  }

  minPriceValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const minPriceNotMet = control.value < this.approvalMinPrice;
      return minPriceNotMet ? {minPriceNotMet: {value: control.value}} : null;
    };
  }



}
