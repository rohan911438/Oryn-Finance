import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "@/contexts/WalletContext";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import LandingPage from "./pages/LandingPage";
import Markets from "./pages/Markets";
import MarketDetail from "./pages/MarketDetail";
import CreateMarket from "./pages/CreateMarket";
import Leaderboard from "./pages/Leaderboard";
import Portfolio from "./pages/Portfolio";
import Analytics from "./pages/Analytics";
import InstitutionalReportingDashboard from "./pages/InstitutionalReportingDashboard";
import Governance from "./pages/Governance";
import HowItWorks from "./pages/HowItWorks";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import { Toaster as HotToaster } from "react-hot-toast";
import SmoothScroll from "@/components/SmoothScroll";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import TradeDetail from "./pages/TradeDetail";
import LiquidityPools from "./pages/LiquidityPools";
import YieldComparison from "./pages/YieldComparison";
import AdminDashboard from "./pages/AdminDashboard";
import TreasuryDashboard from "./pages/TreasuryDashboard";
import IntegrationTest from "./components/IntegrationTest";
import { RabetWalletTest } from "./components/RabetWalletTest";
import CrossChainMonitor from "./pages/CrossChainMonitor";
import InsuranceClaims from "./pages/InsuranceClaims";
import RiskAnalytics from "./pages/RiskAnalytics";
import MarketSentiment from "./pages/MarketSentiment";
import GovernanceAnalytics from "./pages/GovernanceAnalytics";
import LiquidityConcentrationRisk from "./pages/LiquidityConcentrationRisk";
import MarketCreatorVerification from "./pages/MarketCreatorVerification";
import SentimentHistory from "./pages/SentimentHistory";
import LiquidityRebalancing from "./pages/LiquidityRebalancing";
import OracleConsensus from "./pages/OracleConsensus";
import GovernanceTimelock from "./pages/GovernanceTimelock";
import NotificationPreferences from "./pages/NotificationPreferences";
import PortfolioAnalytics from "./pages/PortfolioAnalytics";
import AuditLogs from "./pages/AuditLogs";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { useOffline } from "@/hooks/useOffline";
import { I18nProvider } from "@/i18n";

const queryClient = new QueryClient();

function AppShell() {
  const isOffline = useOffline();
  return (
    <>
      {isOffline && <OfflineBanner />}
      <PWAInstallPrompt />
      <Toaster />
      <Sonner />
      <HotToaster />
      <SmoothScroll />
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/landingpage" element={<LandingPage />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/market/:id" element={<MarketDetail />} />
          <Route path="/create" element={<CreateMarket />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/reports" element={<InstitutionalReportingDashboard />} />
          <Route path="/governance" element={<Governance />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/about" element={<About />} />
          <Route path="/treasury" element={<TreasuryDashboard />} />
          <Route path="/integration-test" element={<IntegrationTest />} />
          <Route path="/rabet-test" element={<RabetWalletTest />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <WalletProvider>
        <WebSocketProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <HotToaster />
            <SmoothScroll />
            <BrowserRouter
              future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/landingpage" element={<LandingPage />} />
                <Route path="/markets" element={<Markets />} />
                <Route path="/market/:id" element={<MarketDetail />} />
                <Route path="/create" element={<CreateMarket />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/trade/:tradeId" element={<TradeDetail />} />
                <Route path="/liquidity" element={<LiquidityPools />} />
                <Route path="/yield" element={<YieldComparison />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/reports" element={<InstitutionalReportingDashboard />} />
                <Route path="/governance" element={<Governance />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="/about" element={<About />} />
                <Route path="/treasury" element={<TreasuryDashboard />} />
                <Route path="/integration-test" element={<IntegrationTest />} />
                <Route path="/rabet-test" element={<RabetWalletTest />} />
                <Route path="/cross-chain" element={<CrossChainMonitor />} />
                <Route path="/insurance" element={<InsuranceClaims />} />
                <Route path="/risk" element={<RiskAnalytics />} />
                <Route path="/sentiment" element={<MarketSentiment />} />
                <Route path="/governance/analytics" element={<GovernanceAnalytics />} />
                <Route path="/liquidity/concentration" element={<LiquidityConcentrationRisk />} />
                <Route path="/market-creators" element={<MarketCreatorVerification />} />
                <Route path="/sentiment/history" element={<SentimentHistory />} />
                <Route path="/liquidity/rebalancing" element={<LiquidityRebalancing />} />
                <Route path="/oracle/consensus" element={<OracleConsensus />} />
                <Route path="/governance/timelock" element={<GovernanceTimelock />} />
                <Route path="/notifications/preferences" element={<NotificationPreferences />} />
                <Route path="/portfolio/analytics" element={<PortfolioAnalytics />} />
                <Route path="/audit" element={<AuditLogs />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </WebSocketProvider>
      </WalletProvider>
    </I18nProvider>
  </QueryClientProvider>
);

export default App;
