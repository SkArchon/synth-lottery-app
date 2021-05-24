import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BACKEND_SERVICE_URL } from '../app.constants';

@Injectable({
  providedIn: 'root'
})
export class BackendService {

  constructor(private http: HttpClient) {}

  public getLotteryDraws(page = 1, limit = 10) {
    return this.http.get(`${BACKEND_SERVICE_URL}/lottery-draws?page=${page}&limit=${limit}`);
  }

}
