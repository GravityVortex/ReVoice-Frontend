'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { GrantCreditsModal } from '@/shared/blocks/admin/grant-credits-modal';

export function CreditsGive() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button onClick={() => setShowModal(true)}>
        <Plus className="mr-0 h-4 w-4" />
        赠送
      </Button>
      <GrantCreditsModal open={showModal} onOpenChange={setShowModal} />
    </>
  );
}
