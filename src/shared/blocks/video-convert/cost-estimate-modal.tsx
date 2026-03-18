'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from "@/shared/components/ui/button";
import { useAppContext } from "@/shared/contexts/app";
import { Sparkles, Zap, CreditCard, Clock, Languages, Users, Flame, Rocket, ArrowRight } from 'lucide-react';
import { LangBadge } from '@/shared/components/ui/lang-badge';

interface CostEstimateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    cost: number;
    durationMinutes: number;
    pointsPerMinute: number;
    // 配置信息
    sourceLanguage: string;
    targetLanguage: string;
    speakerCount: string;
}

export function CostEstimateModal({
    isOpen,
    onClose,
    onConfirm,
    cost,
    durationMinutes,
    pointsPerMinute,
    sourceLanguage,
    targetLanguage,
    speakerCount
}: CostEstimateModalProps) {
    const t = useTranslations('video_convert.projectAddConvertModal');
    const { user } = useAppContext();

    const currentBalance = user?.credits?.remainingCredits || 0;
    const isInsufficient = currentBalance < cost;
    const balanceAfter = Math.max(0, currentBalance - cost);
    const canTranslateMinutes = Math.floor(currentBalance / pointsPerMinute);

    const handleRecharge = () => {
        window.open('/pricing', '_blank');
    };

    const getLanguageLabel = (langCode: string) => {
        return t(`languages.${langCode}`);
    };

    const getSpeakerLabel = (count: string) => {
        return count === '1' ? t('speakers.single') : t('speakers.multiple');
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto bg-black/95 backdrop-blur-2xl shadow-[0_0_60px_-20px_rgba(0,0,0,0.5)] border border-white/10">
                {/* Background glow effects */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[300px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.04] via-transparent to-transparent blur-3xl pointer-events-none" />

                <DialogHeader className="relative z-10">
                    <motion.div
                        className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-white/[0.08] to-white/[0.04] flex items-center justify-center mb-6 border-2 border-white/10 relative overflow-hidden"
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    >
                        <div className="absolute inset-0 bg-white/[0.04] blur-xl animate-pulse" />
                        <Rocket className="w-10 h-10 text-white/70 drop-shadow-[0_0_14px_rgba(255,255,255,0.15)] relative z-10" />
                    </motion.div>
                    <DialogTitle className="text-center text-3xl font-extrabold text-white font-serif tracking-tight">
                        {t('steps.confirmConvert')}
                    </DialogTitle>
                    <DialogDescription className="text-center text-white/60">
                        {t('confirm.checkInfo')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-6 relative z-10">
                    {/* Language pair display */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="p-5 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] via-transparent to-white/[0.02]" />
                        <div className="relative z-10 flex items-center justify-center gap-5">
                            <div className="flex flex-col items-center text-center">
                                <LangBadge code={sourceLanguage} size="lg" />
                                <p className="mt-1.5 text-base font-bold text-white">{t(`languages.${sourceLanguage}`)}</p>
                            </div>
                            <ArrowRight className="h-6 w-6 text-white/40 shrink-0" />
                            <div className="flex flex-col items-center text-center">
                                <LangBadge code={targetLanguage} size="lg" />
                                <p className="mt-1.5 text-base font-bold text-white">{t(`languages.${targetLanguage}`)}</p>
                            </div>
                        </div>
                    </motion.div>

                    {/* 配置信息总结 */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="grid grid-cols-3 gap-3 p-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] via-transparent to-white/[0.02]" />
                        {[
                            { icon: Clock, label: t('confirm.videoDuration'), value: `${durationMinutes} ${t('ui.minutes')}` },
                            { icon: Users, label: t('confirm.speakerCount'), value: getSpeakerLabel(speakerCount) },
                            { icon: Zap, label: t('confirm.consumeCredits'), value: `${cost}` },
                        ].map((item, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.2 + idx * 0.05 }}
                                className="space-y-1.5 text-center relative z-10"
                            >
                                <div className="mx-auto w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm bg-white/[0.06] border border-white/10">
                                    <item.icon className="w-4 h-4 text-white/60" />
                                </div>
                                <p className="text-[10px] text-white/50 uppercase tracking-wide font-bold">{item.label}</p>
                                <p className="text-sm font-bold text-white">{item.value}</p>
                            </motion.div>
                        ))}
                    </motion.div>

                    {/* 积分消耗与余额对比 */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="p-6 bg-white/[0.03] rounded-2xl border border-white/10 backdrop-blur-sm relative overflow-hidden"
                    >
                        {/* Animated glow */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-white/[0.01] opacity-50" />

                        <div className="grid grid-cols-2 gap-6 mb-5 relative z-10">
                            {/* 剩余积分 */}
                            <div className="text-center">
                                <p className="text-sm text-white/60 mb-2 font-medium">{t('confirm.remainingCredits')}</p>
                                <motion.div
                                    className="flex items-baseline justify-center gap-1"
                                    initial={{ scale: 0.5 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring", stiffness: 200 }}
                                >
                                    <span className={cn(
                                        "text-5xl font-extrabold tabular-nums",
                                        isInsufficient ? "text-red-400" : "text-white"
                                    )}>
                                        {currentBalance}
                                    </span>
                                    <span className="text-sm font-medium text-white/50 mb-2">{t('confirm.credits')}</span>
                                </motion.div>
                                <p className="text-xs text-white/40 mt-2">
                                    ≈ {canTranslateMinutes} 分钟视频
                                </p>
                            </div>

                            {/* 消耗积分 */}
                            <div className="text-center">
                                <p className="text-sm text-white/60 mb-2 font-medium">{t('confirm.consumeCredits')}</p>
                                <motion.div
                                    className="flex items-baseline justify-center gap-1"
                                    initial={{ scale: 0.5 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                                >
                                    <span className="text-5xl font-extrabold text-red-400 tabular-nums drop-shadow-[0_0_15px_rgba(248,113,113,0.6)]">
                                        {cost}
                                    </span>
                                    <span className="text-sm font-medium text-white/50 mb-2">{t('confirm.credits')}</span>
                                </motion.div>
                                <p className="text-xs text-white/50 mt-2 flex items-center justify-center gap-1">
                                    <Zap className="w-3 h-3" />
                                    {t('confirm.creditsPerMinute', { points: pointsPerMinute })}
                                </p>
                            </div>
                        </div>

                        {/* 视觉化对比进度条 */}
                        <div className="relative h-4 w-full bg-white/10 rounded-full overflow-hidden border border-white/20 backdrop-blur-sm">
                            {/* 剩余积分底色 */}
                            <motion.div
                                className="absolute top-0 left-0 h-full bg-white/15"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, (currentBalance / Math.max(currentBalance, cost)) * 100)}%` }}
                                transition={{ duration: 0.8, delay: 0.4 }}
                            />
                            {/* 消耗积分覆盖层 */}
                            <motion.div
                                className={cn(
                                    "absolute top-0 left-0 h-full",
                                    isInsufficient
                                        ? "bg-gradient-to-r from-red-500 to-red-600 shadow-[0_0_20px_rgba(239,68,68,0.6)]"
                                        : "bg-gradient-to-r from-primary to-primary/70 shadow-[0_0_20px_rgba(0,0,0,0.2)]"
                                )}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, (cost / Math.max(currentBalance, cost)) * 100)}%` }}
                                transition={{ duration: 0.8, delay: 0.5 }}
                            />
                        </div>

                        {/* 警告或提示 */}
                        {isInsufficient ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.6 }}
                                className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl backdrop-blur-sm"
                            >
                                <p className="text-sm text-red-400 font-medium flex items-center gap-2">
                                    <Flame className="w-4 h-4 animate-pulse" />
                                    {t('confirm.insufficientCredits', { minutes: canTranslateMinutes })}
                                </p>
                            </motion.div>
                        ) : (
                            <p className="mt-4 text-sm text-white/60 text-center">
                                消费后剩余: <span className="font-bold text-white">{balanceAfter}</span> 积分
                            </p>
                        )}
                    </motion.div>

                    {/* 预计处理时间 */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="p-4 bg-white/[0.03] rounded-xl border border-white/10 backdrop-blur-sm"
                    >
                        <p className="text-sm text-white/60 text-center flex items-center justify-center gap-2">
                            <Clock className="w-4 h-4" />
                            {t('confirm.estimatedTime')}
                        </p>
                    </motion.div>
                </div>

                <DialogFooter className="flex-col gap-3 sm:gap-0 relative z-10">
                    {isInsufficient ? (
                        <>
                            <Button
                                className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-[0_0_30px_-5px_rgba(239,68,68,0.6)] hover:shadow-[0_0_40px_-5px_rgba(239,68,68,0.8)] text-base h-14 font-bold transition-all duration-300 border-0 relative overflow-hidden group"
                                onClick={handleRecharge}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                                <CreditCard className="w-5 h-5 mr-2 relative z-10" />
                                <span className="relative z-10">{t('confirm.buyCredits')}</span>
                            </Button>
                            <p className="text-center text-xs text-white/40">{t('confirm.buyCreditsHint')}</p>
                            <Button variant="ghost" className="w-full text-white/60 hover:text-white hover:bg-white/5" onClick={onClose}>
                                {t('buttons.cancel')}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                className={cn(
                                    "w-full text-base h-14 font-bold transition-all duration-300 border-0 relative overflow-hidden group",
                                    "shadow-[0_0_20px_-8px_rgba(0,0,0,0.3)]",
                                    "bg-primary hover:bg-primary/90 text-primary-foreground"
                                )}
                                onClick={onConfirm}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                                <Sparkles className="w-5 h-5 mr-2 relative z-10 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                                <span className="relative z-10">{t('buttons.startConvert')}</span>
                            </Button>
                            <Button variant="ghost" className="w-full text-white/60 hover:text-white hover:bg-white/5" onClick={onClose}>
                                {t('buttons.previous')}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
