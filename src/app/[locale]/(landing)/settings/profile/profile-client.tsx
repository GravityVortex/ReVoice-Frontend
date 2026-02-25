'use client';

import { useMemo } from 'react';

import { FormCard } from '@/shared/blocks/form';
import { ConsolePageHeader } from '@/shared/blocks/console/page-header';
import { Form as FormType } from '@/shared/types/blocks/form';

interface ProfileClientProps {
  user: any;
  translations: {
    fields: {
      email: string;
      name: string;
      avatar: string;
    };
    edit: {
      title: string;
      description: string;
      submit: string;
    };
    errors: {
      noAuth: string;
      nameRequired: string;
      updateFailed: string;
    };
    success: {
      updated: string;
    };
  };
}

export function ProfileClient({ user: initialUser, translations }: ProfileClientProps) {
  const user = initialUser;

  // 使用 useMemo 确保表单对象随 user 状态更新
  const form: FormType = useMemo(() => {
    return {
      fields: [
        {
          name: 'email',
          title: translations.fields.email,
          type: 'email',
          attributes: { disabled: true },
        },
      { name: 'name', title: translations.fields.name, type: 'text' },
      {
        name: 'image',
        title: translations.fields.avatar,
        type: 'upload_image',
        metadata: {
          max: 1,
        },
      },
    ],
    data: user,
    passby: {
      user: user,
    },
    submit: {
      handler: async (data: FormData, passby: any) => {
        const { user } = passby;
        if (!user) {
          throw new Error(translations.errors.noAuth);
        }

        const name = data.get('name') as string;
        if (!name?.trim()) {
          throw new Error(translations.errors.nameRequired);
        }

        const image = data.get('image');

        try {
          const response = await fetch('/api/user/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              name: name.trim(),
              image: image as string,
            }),
          });

          if (!response.ok) {
            throw new Error(translations.errors.updateFailed);
          }

          return {
            status: 'success',
            message: translations.success.updated,
            redirect_url: '/settings/profile',
          };
        } catch (error) {
          throw new Error(translations.errors.updateFailed);
        }
      },
      button: {
        title: translations.edit.submit,
      },
    },
  };
  }, [user, translations]);

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title={translations.edit.title}
        description={translations.edit.description}
        icon="User"
      />

      <FormCard
        key={user?.email || 'no-email'}
        form={form}
      />
    </div>
  );
}
