import type { ContactMessageInput } from './contact.types.js';
import type { Mailer } from '../mail/mail.types.js';

export class ContactService {
  constructor(private readonly mailer: Mailer) { }

  async sendContactMessage(input: ContactMessageInput): Promise<void> {
    await this.mailer.sendContactEmail({
      ...input,
      sentAt: new Date()
    });
  }
}
