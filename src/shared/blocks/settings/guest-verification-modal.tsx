'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Mail, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { cacheSet } from '@/shared/lib/cache';

interface GuestVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser: any;
}

export function GuestVerificationModal({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
}: GuestVerificationModalProps) {
  const t = useTranslations('settings.guestVerification');
  const [formData, setFormData] = useState({
    email: '',
    verificationCode: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // 邮箱正则验证
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // 密码规则验证：不少于8位，包含大小写字母
  const validatePassword = (password: string): boolean => {
    if (password.length < 8) return false;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    return hasUpperCase && hasLowerCase;
  };

  // 发送验证码
  const handleSendCode = async () => {
    // 验证邮箱
    if (!formData.email) {
      setErrors({ ...errors, email: t('errors.emailRequired') });
      return;
    }
    if (!validateEmail(formData.email)) {
      setErrors({ ...errors, email: t('errors.emailInvalid') });
      return;
    }

    setSendingCode(true);
    try {
      const response = await fetch('/api/user/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          userId: currentUser.id,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        // 特殊处理邮箱已存在的错误
        if (response.status === 409 || data.error === 'Email already registered') {
          setErrors({ email: t('errors.emailExists') });
          throw new Error(t('errors.emailExists'));
        }
        throw new Error(data.error || t('errors.sendCodeFailed'));
      }

      toast.success(t('success.codeSent'));
      
      // 开始倒计时
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || t('errors.sendCodeFailed'));
    } finally {
      setSendingCode(false);
    }
  };

  // 表单验证
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 验证邮箱
    if (!formData.email) {
      newErrors.email = t('errors.emailRequired');
    } else if (!validateEmail(formData.email)) {
      newErrors.email = t('errors.emailInvalid');
    }

    // 验证验证码
    if (!formData.verificationCode) {
      newErrors.verificationCode = t('errors.codeRequired');
    }

    // 验证密码
    if (!formData.password) {
      newErrors.password = t('errors.passwordRequired');
    } else if (!validatePassword(formData.password)) {
      newErrors.password = t('errors.passwordInvalid');
    }

    // 验证确认密码
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = t('errors.confirmPasswordRequired');
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('errors.passwordMismatch');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/user/verify-guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          email: formData.email,
          verificationCode: formData.verificationCode,
          password: formData.password,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        // 特殊处理邮箱已存在的错误
        if (response.status === 409 || data.error === 'Email already registered') {
          setErrors({ email: t('errors.emailExists') });
          throw new Error(t('errors.emailExists'));
        }
        throw new Error(data.error || t('errors.verifyFailed'));
      }
      // 修改ls中邮箱密码
      cacheSet('guest_email', formData.email);
      cacheSet('guest_password', formData.password);

      // 先关闭弹框，再调用成功回调（父组件会显示 toast 和刷新数据）
      handleClose();
      onSuccess();
    } catch (error: any) {
      // 如果是邮箱已存在错误，不需要再次提示（已经在表单中显示）
      const emailExistsMsg = t('errors.emailExists');
      if (!error.message?.includes(emailExistsMsg)) {
        toast.error(error.message || t('errors.verifyFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  // 关闭弹框
  const handleClose = () => {
    setFormData({
      email: '',
      verificationCode: '',
      password: '',
      confirmPassword: '',
    });
    setErrors({});
    setCountdown(0);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* 邮箱 */}
          <div className="space-y-2">
            <Label htmlFor="email">
              {t('fields.email')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder={t('placeholders.email')}
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                setErrors({ ...errors, email: '' });
              }}
              className={errors.email ? 'border-red-500' : ''}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email}</p>
            )}
          </div>

          {/* 验证码 */}
          <div className="space-y-2">
            <Label htmlFor="verificationCode">
              {t('fields.verificationCode')} <span className="text-red-500">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="verificationCode"
                type="text"
                placeholder={t('placeholders.verificationCode')}
                value={formData.verificationCode}
                onChange={(e) => {
                  setFormData({ ...formData, verificationCode: e.target.value });
                  setErrors({ ...errors, verificationCode: '' });
                }}
                className={errors.verificationCode ? 'border-red-500' : ''}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSendCode}
                disabled={sendingCode || countdown > 0 || !formData.email}
                className="whitespace-nowrap"
              >
                {sendingCode ? (
                  <>
                    <Loader2 className="size-4 mr-1 animate-spin" />
                    {t('buttons.sending')}
                  </>
                ) : countdown > 0 ? (
                  `${countdown}${t('buttons.resend')}`
                ) : (
                  t('buttons.sendCode')
                )}
              </Button>
            </div>
            {errors.verificationCode && (
              <p className="text-sm text-red-500">{errors.verificationCode}</p>
            )}
          </div>

          {/* 密码 */}
          <div className="space-y-2">
            <Label htmlFor="password">
              {t('fields.password')} <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={t('placeholders.password')}
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
                  setErrors({ ...errors, password: '' });
                }}
                className={errors.password ? 'border-red-500' : ''}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password}</p>
            )}
          </div>

          {/* 确认密码 */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">
              {t('fields.confirmPassword')} <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder={t('placeholders.confirmPassword')}
                value={formData.confirmPassword}
                onChange={(e) => {
                  setFormData({ ...formData, confirmPassword: e.target.value });
                  setErrors({ ...errors, confirmPassword: '' });
                }}
                className={errors.confirmPassword ? 'border-red-500' : ''}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-sm text-red-500">{errors.confirmPassword}</p>
            )}
          </div>

          {/* 按钮 */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className="flex-1"
            >
              {t('buttons.cancel')}
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  {t('buttons.submitting')}
                </>
              ) : (
                t('buttons.submit')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
