'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, Shield } from 'lucide-react';

import { FormCard } from '@/shared/blocks/form';
import { ConsolePageHeader } from '@/shared/blocks/console/page-header';
import { Form as FormType } from '@/shared/types/blocks/form';
import { Button } from '@/shared/components/ui/button';
import { GuestVerificationModal } from '@/shared/blocks/settings/guest-verification-modal';

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
    guest: {
      tip: string;
      banner: {
        title: string;
        description: string;
        button: string;
      };
      success: string;
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
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);

  const handleVerificationSuccess = async () => {
    // 关闭弹框
    setIsVerificationModalOpen(false);
    
    // 显示成功提示
    toast.success(translations.guest.success);
    
    // 重新获取用户信息并更新状态
    try {
      const response = await fetch('/api/user/info');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        
        // 刷新服务端组件数据（确保页面数据同步）
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to refresh user info:', error);
      // 即使 API 失败，也尝试刷新页面
      router.refresh();
    }
  };

  // 使用 useMemo 确保表单对象随 user 状态更新
  const form: FormType = useMemo(() => {
    // 在 useMemo 内部计算 isGuest，确保使用最新的 user 值
    const email = user?.email || '';
    const isGuest = email.startsWith('guest_') && email.endsWith('@temp.local');

    return {
      fields: [
        {
          name: 'email',
          title: translations.fields.email,
          type: 'email',
          attributes: { disabled: true },
          tip: isGuest ? translations.guest.tip : undefined,
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

  // 判断是否是访客账号（用于条件渲染）
  const email = user?.email || '';
  const isGuest = email.startsWith('guest_') && email.endsWith('@temp.local');

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title={translations.edit.title}
        description={translations.edit.description}
        icon="User"
      />

      {isGuest && (
        <div className="bg-card/50 border-white/10 relative overflow-hidden rounded-2xl border p-4 shadow-lg backdrop-blur">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary/20 via-primary/5 to-transparent opacity-60"
          />
          <div className="relative flex items-start gap-3">
            <Mail className="text-primary mt-0.5 size-5" />
            <div className="flex-1">
              <h3 className="text-foreground font-medium">
                {translations.guest.banner.title}
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {translations.guest.banner.description}
              </p>
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsVerificationModalOpen(true)}
                className="mt-3 rounded-full"
              >
                <Shield className="mr-1 size-4" />
                {translations.guest.banner.button}
              </Button>
            </div>
          </div>
        </div>
      )}

      <FormCard
        key={user?.email || 'no-email'}
        form={form}
      />

      {/* 访客认证弹框 */}
      <GuestVerificationModal
        isOpen={isVerificationModalOpen}
        onClose={() => setIsVerificationModalOpen(false)}
        onSuccess={handleVerificationSuccess}
        currentUser={user}
      />
    </div>
  );
}
