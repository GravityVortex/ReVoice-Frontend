import { EmailManager, ResendProvider } from '@/extensions/email';
import { Configs, getAllConfigs } from '@/shared/models/config';

/**
 * get email service with configs
 */
export function getEmailServiceWithConfigs(configs: Configs) {
  const emailManager = new EmailManager();

  if (configs.resend_api_key) {
    emailManager.addProvider(
      new ResendProvider({
        apiKey: configs.resend_api_key,
        defaultFrom: configs.resend_sender_email,
      })
    );
  }

  return emailManager;
}

/**
 * get email service instance
 */
export async function getEmailService(): Promise<EmailManager> {
  const configs = await getAllConfigs();
  return getEmailServiceWithConfigs(configs);
}
