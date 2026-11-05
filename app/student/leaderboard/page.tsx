import type { Metadata } from 'next';
import LeaderboardContent from './components/LeaderboardContent';

export const metadata: Metadata = { title: 'Leaderboard' };

/** Division leaderboard (students and schools) from `GET /leaderboard`, `/leaderboard/me`, `/leaderboard/schools`. */
export default function Leaderboard() {
  return <LeaderboardContent />;
}
