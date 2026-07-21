import { parseContactMessageBody } from './contact.dto.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../http/async-handler.js';

import type { ContactService } from '../../services/contact/contact.service.js';

export function createContactController(contactService: ContactService) {
    return {
        sendContactMessage: asyncHandler(async (req, res) => {
            const { isSuspectedBot, ...input } = parseContactMessageBody(req.body);

            if (isSuspectedBot) {
                logger.warn('Contact message suspected bot, skipping send', { email: input.email });
                res.status(200).json({ message: 'Contact message sent' });
                return;
            }

            await contactService.sendContactMessage(input);

            res.status(200).json({ message: 'Contact message sent' });
        })
    };
}
