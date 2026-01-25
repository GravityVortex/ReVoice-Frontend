// 个人资料页面
import { getTranslations } from 'next-intl/server';
import { getUserInfo } from '@/shared/models/user';
import { Empty } from '@/shared/blocks/common';
import { ProfileClient } from './profile-client';

export default async function ProfilePage() {
  const userPromise = getUserInfo();
  const translationsPromise = getTranslations('settings.profile');

  const user = await userPromise;
  
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await translationsPromise;

  // 准备翻译文本
  const translations = {
    fields: {
      email: t('fields.email'),
      name: t('fields.name'),
      avatar: t('fields.avatar'),
    },
    edit: {
      title: t('edit.title'),
      description: t('edit.description'),
      submit: t('edit.buttons.submit'),
    },
    guest: {
      tip: t('guest.tip'),
      banner: {
        title: t('guest.banner.title'),
        description: t('guest.banner.description'),
        button: t('guest.banner.button'),
      },
      success: t('guest.success'),
    },
    errors: {
      noAuth: t('errors.noAuth'),
      nameRequired: t('errors.nameRequired'),
      updateFailed: t('errors.updateFailed'),
    },
    success: {
      updated: t('success.updated'),
    },
  };

  return <ProfileClient user={user} translations={translations} />;
}
