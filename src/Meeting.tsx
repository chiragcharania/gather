import { LiveKitRoom, VideoConference, type LiveKitRoomProps } from '@livekit/components-react';
import '@livekit/components-styles';
export default function Meeting(props: LiveKitRoomProps) {
  return <LiveKitRoom {...props}><VideoConference /></LiveKitRoom>;
}
