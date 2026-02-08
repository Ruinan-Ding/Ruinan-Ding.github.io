import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private isDarkMode$ = new BehaviorSubject<boolean>(true);

  get isDarkMode(): Observable<boolean> {
    return this.isDarkMode$.asObservable();
  }

  toggleTheme(): void {
    this.isDarkMode$.next(!this.isDarkMode$.value);
  }
}
