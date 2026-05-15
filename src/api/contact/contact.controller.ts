import { parseContactMessageBody } from './contact.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { ContactService } from '../../services/contact/contact.service.js';

export function createContactController(contactService: ContactService) {
  return {
    sendContactMessage: asyncHandler(async (req, res) => {
      const input = parseContactMessageBody(req.body);

      await contactService.sendContactMessage(input);

      res.status(200).json({ message: 'Contact message sent' });
    })
  };
}
