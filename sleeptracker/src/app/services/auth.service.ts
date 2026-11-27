import { Injectable, OnDestroy, signal } from '@angular/core';
import { Amplify } from 'aws-amplify';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  readonly configured = !!Amplify.getConfig().Auth?.Cognito?.userPoolId;
  readonly userId = signal<string | null>(null);
  readonly email = signal('');
  readonly initialized = signal(false);
  private revision = 0;
  private readonly stopListening: () => void;

  constructor() {
    this.stopListening = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn' || payload.event === 'signedOut') {
        void this.refresh();
      }
    });
    void this.refresh();
  }

  private async refresh() {
    const revision = ++this.revision;
    try {
      const user = this.configured ? await getCurrentUser() : null;
      if (revision !== this.revision) return;
      this.email.set(user?.signInDetails?.loginId || user?.username || '');
      this.userId.set(user?.userId || null);
    } catch {
      if (revision !== this.revision) return;
      this.email.set('');
      this.userId.set(null);
    } finally {
      if (revision === this.revision) this.initialized.set(true);
    }
  }

  async logout() {
    await signOut();
    await this.refresh();
  }

  ngOnDestroy() {
    this.stopListening();
  }
}
