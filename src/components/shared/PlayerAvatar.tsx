import { useState } from 'react';
import { cn } from '@/utils';
import { playerAvatarUrl, playerInitials } from '@/utils/playerAvatar';

interface Props { username: string; uuid?: string; className?: string }

// Identity-keyed state avoids carrying a failed image into a different player.
export function PlayerAvatar(props: Props) {
  return <PlayerAvatarImage key={`${props.uuid ?? ''}:${props.username}`} {...props} />;
}

function PlayerAvatarImage({ username, uuid, className }: Props) {
  const [failed, setFailed] = useState(false);
  const url = playerAvatarUrl(username, uuid);
  return (
    <span aria-hidden="true" className={cn(
      'inline-flex w-8 h-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-xs font-medium text-muted-foreground', className,
    )}>
      {url && !failed ? (
        <img src={url} alt="" width={32} height={32} loading="lazy" decoding="async"
          referrerPolicy="no-referrer" className="w-full h-full object-cover [image-rendering:pixelated]"
          onError={() => setFailed(true)} />
      ) : playerInitials(username)}
    </span>
  );
}
