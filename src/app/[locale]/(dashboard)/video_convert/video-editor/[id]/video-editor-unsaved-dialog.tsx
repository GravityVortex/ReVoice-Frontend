'use client';

import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';

type VideoEditorUnsavedDialogProps = {
  open: boolean;
  title: string;
  description: string;
  stayLabel: string;
  leaveLabel: string;
  onOpenChange: (open: boolean) => void;
  onStay: () => void;
  onConfirmLeave: () => void;
};

export function VideoEditorUnsavedDialog(props: VideoEditorUnsavedDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={props.onStay}>
            {props.stayLabel}
          </Button>
          <Button variant="destructive" onClick={props.onConfirmLeave}>
            {props.leaveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
