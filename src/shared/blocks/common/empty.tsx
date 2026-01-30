import { AlertTriangle } from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';

export function Empty({ message }: { message: string }) {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center p-6">
      <Card className="bg-card/60 border-white/10 w-full max-w-xl shadow-lg backdrop-blur">
        <CardHeader className="gap-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="bg-white/[0.03] border-white/10 text-muted-foreground flex size-9 items-center justify-center rounded-xl border"
            >
              <AlertTriangle className="size-4" />
            </span>
            <CardTitle className="text-base">Notice</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
