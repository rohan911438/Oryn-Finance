import { useState } from 'react';
import { Trophy, Medal, TrendingUp, Percent, Hash, Star } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { leaderboardData } from '@/data/mockData';

type TimeFrame = 'all' | 'monthly' | 'weekly';

function formatProfit(profit: number): string {
  if (profit >= 1000) {
    return `$${(profit / 1000).toFixed(1)}K`;
  }
  return `$${profit.toFixed(0)}`;
}

const rankColors: Record<number, string> = {
  1: 'text-warning',
  2: 'text-muted-foreground',
  3: 'text-orange-400',
};

const rankBgColors: Record<number, string> = {
  1: 'bg-warning/10 border-warning/30',
  2: 'bg-muted/50 border-border',
  3: 'bg-orange-400/10 border-orange-400/30',
};

export default function Leaderboard() {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('all');

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4">
            <Trophy className="w-8 h-8 text-warning" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Leaderboard</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Top traders and market creators on Oryn Finance
          </p>
        </div>

        {/* Time Frame Filter */}
        <div className="flex justify-center gap-2 mb-10">
          {(['all', 'monthly', 'weekly'] as TimeFrame[]).map((tf) => (
            <Button
              key={tf}
              variant="ghost"
              onClick={() => setTimeFrame(tf)}
              className={`tab-button capitalize ${timeFrame === tf ? 'active' : ''}`}
            >
              {tf === 'all' ? 'All Time' : tf}
            </Button>
          ))}
        </div>

        {/* Top 3 Podium */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 max-w-3xl mx-auto">
          {leaderboardData.slice(0, 3).map((entry, index) => {
            const order = [1, 0, 2]; // Display order: 2nd, 1st, 3rd
            const actualIndex = order[index];
            const trader = leaderboardData[actualIndex];
            const isFirst = actualIndex === 0;

            return (
              <div
                key={trader.address}
                className={`glass-card p-6 text-center ${isFirst ? 'md:-mt-4' : ''} ${rankBgColors[trader.rank]} border`}
                style={{ order: index }}
              >
                <div className={`text-4xl mb-3 ${rankColors[trader.rank]}`}>
                  {trader.rank === 1 ? <Trophy className="w-12 h-12 mx-auto" /> : <Medal className="w-10 h-10 mx-auto" />}
                </div>
                <div className="text-2xl font-bold mb-1">#{trader.rank}</div>
                <div className="font-semibold mb-1 truncate">
                  {trader.username || trader.address}
                </div>
                <div className="text-2xl font-bold gradient-text mb-2">
                  {formatProfit(trader.totalProfit)}
                </div>
                <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                  <span>{trader.trades} trades</span>
                  <span>{trader.winRate}% win</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Full Leaderboard Table */}
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-4 px-6 font-semibold">
                    <Hash className="w-4 h-4 inline mr-2" />
                    Rank
                  </th>
                  <th className="text-left py-4 px-6 font-semibold">Trader</th>
                  <th className="text-right py-4 px-6 font-semibold">
                    <TrendingUp className="w-4 h-4 inline mr-2" />
                    Profit/Loss
                  </th>
                  <th className="text-right py-4 px-6 font-semibold hidden md:table-cell">Trades</th>
                  <th className="text-right py-4 px-6 font-semibold hidden md:table-cell">
                    <Percent className="w-4 h-4 inline mr-2" />
                    Win Rate
                  </th>
                  <th className="text-right py-4 px-6 font-semibold hidden lg:table-cell">
                    <Star className="w-4 h-4 inline mr-2" />
                    Favorite
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboardData.map((entry, index) => (
                  <tr 
                    key={entry.address} 
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="py-4 px-6">
                      <span className={`font-bold ${rankColors[entry.rank] || 'text-foreground'}`}>
                        #{entry.rank}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div>
                        <div className="font-medium">
                          {entry.username || entry.address}
                        </div>
                        {entry.username && (
                          <div className="text-xs text-muted-foreground">{entry.address}</div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className={`font-bold ${entry.totalProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {entry.totalProfit >= 0 ? '+' : ''}{formatProfit(entry.totalProfit)}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right hidden md:table-cell">
                      {entry.trades}
                    </td>
                    <td className="py-4 px-6 text-right hidden md:table-cell">
                      <span className={entry.winRate >= 60 ? 'text-success' : entry.winRate >= 50 ? 'text-foreground' : 'text-destructive'}>
                        {entry.winRate}%
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right hidden lg:table-cell">
                      <Badge variant="outline" className="text-xs">
                        {entry.favoriteCategory}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
