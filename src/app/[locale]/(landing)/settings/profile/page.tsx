// 个人资料页面
import { getTranslations } from 'next-intl/server';
import { getUserInfo } from '@/shared/models/user';
import { Empty } from '@/shared/blocks/common';
import { ProfileClient } from './profile-client';

export default async function ProfilePage() {
  const user = await getUserInfo();
  
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await getTranslations('settings.profile');

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
  };

  return <ProfileClient user={user} translations={translations} />;
}
