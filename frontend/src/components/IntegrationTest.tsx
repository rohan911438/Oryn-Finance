import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, RefreshCw, Globe, Database, Settings } from 'lucide-react';
import { useBackendStatus, useBackendHealth, useContractStatus, useNetworkInfo } from '@/hooks/useBackend';

const IntegrationTestComponent = () => {
  const backendStatus = useBackendStatus();
  const backendHealth = useBackendHealth();
  const contractStatus = useContractStatus();
  const networkInfo = useNetworkInfo();

  const StatusIcon = ({ isLoading, isConnected, error }: { isLoading: boolean; isConnected: boolean; error?: string }) => {
    if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    if (error || !isConnected) return <XCircle className="h-4 w-4 text-red-500" />;
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  };

  const StatusBadge = ({ isLoading, isConnected, error }: { isLoading: boolean; isConnected: boolean; error?: string }) => {
    if (isLoading) return <Badge variant="secondary">Testing...</Badge>;
    if (error || !isConnected) return <Badge variant="destructive">Disconnected</Badge>;
    return <Badge variant="default" className="bg-green-600">Connected</Badge>;
  };

  const refreshAll = () => {
    backendStatus.refetch();
    backendHealth.refetch();
    contractStatus.refetch();
    networkInfo.refetch();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Frontend-Backend Integration Test</h1>
          <p className="text-gray-300 mb-6">Testing Oryn Finance platform connectivity and contract integration</p>
          <Button onClick={refreshAll} className="bg-blue-600 hover:bg-blue-700">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh All Tests
          </Button>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Backend Connectivity */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center space-x-2">
                <Globe className="h-5 w-5 text-blue-400" />
                <CardTitle className="text-white">Backend Connectivity</CardTitle>
              </div>
              <StatusIcon 
                isLoading={backendStatus.isLoading} 
                isConnected={backendStatus.isConnected}
                error={backendStatus.error}
              />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Status:</span>
                  <StatusBadge 
                    isLoading={backendStatus.isLoading} 
                    isConnected={backendStatus.isConnected}
                    error={backendStatus.error}
                  />
                </div>
                {backendStatus.latency && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Latency:</span>
                    <span className="text-white font-mono">{backendStatus.latency}ms</span>
                  </div>
                )}
                {backendStatus.error && (
                  <div className="text-red-400 text-sm p-2 bg-red-900/20 rounded">
                    {backendStatus.error}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Backend Health */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="h-5 w-5 text-green-400" />
                <CardTitle className="text-white">Backend Health</CardTitle>
              </div>
              <StatusIcon 
                isLoading={backendHealth.isLoading} 
                isConnected={!!backendHealth.data}
                error={backendHealth.error}
              />
            </CardHeader>
            <CardContent>
              {backendHealth.isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                </div>
              ) : backendHealth.data ? (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Version:</span>
                    <span className="text-white">{backendHealth.data.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Environment:</span>
                    <span className="text-white">{backendHealth.data.environment || 'Development'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Stellar Network:</span>
                    <span className="text-white">{backendHealth.data.services?.stellar?.network || 'testnet'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Database:</span>
                    <Badge variant={backendHealth.data.services?.database?.status === 'connected' ? 'default' : 'secondary'}>
                      {backendHealth.data.services?.database?.status || 'disconnected'}
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="text-red-400 text-sm p-2 bg-red-900/20 rounded">
                  {backendHealth.error || 'Failed to load health data'}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contract Integration */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center space-x-2">
                <Settings className="h-5 w-5 text-purple-400" />
                <CardTitle className="text-white">Contract Integration</CardTitle>
              </div>
              <StatusIcon 
                isLoading={contractStatus.isLoading} 
                isConnected={!!contractStatus.data}
                error={contractStatus.error}
              />
            </CardHeader>
            <CardContent>
              {contractStatus.isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                </div>
              ) : contractStatus.data ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Soroban RPC:</span>
                    <Badge variant={contractStatus.data.sorobanHealth?.isConnected ? 'default' : 'destructive'}>
                      {contractStatus.data.sorobanHealth?.isConnected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Network:</span>
                    <span className="text-white">{contractStatus.data.sorobanHealth?.network || 'testnet'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Contracts:</span>
                    <span className="text-white">
                      {contractStatus.data.summary?.reachableContracts || 0}/{contractStatus.data.summary?.totalContracts || 0}
                    </span>
                  </div>
                  {contractStatus.data.contractConnectivity && (
                    <div className="space-y-1">
                      <span className="text-gray-300 text-sm">Contract Status:</span>
                      <div className="grid grid-cols-1 gap-1">
                        {contractStatus.data.contractConnectivity.slice(0, 4).map((contract: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="text-gray-400">{contract.contractName}:</span>
                            <Badge variant={contract.isReachable ? 'default' : 'secondary'} className="text-xs py-0">
                              {contract.isReachable ? 'OK' : 'Unreachable'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-red-400 text-sm p-2 bg-red-900/20 rounded">
                  {contractStatus.error || 'Failed to load contract status'}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Network Information */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center space-x-2">
                <Globe className="h-5 w-5 text-yellow-400" />
                <CardTitle className="text-white">Network Information</CardTitle>
              </div>
              <StatusIcon 
                isLoading={networkInfo.isLoading} 
                isConnected={!!networkInfo.data}
                error={networkInfo.error}
              />
            </CardHeader>
            <CardContent>
              {networkInfo.isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin text-yellow-400" />
                </div>
              ) : networkInfo.data ? (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Network:</span>
                    <span className="text-white">{networkInfo.data.network}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Latest Ledger:</span>
                    <span className="text-white font-mono">{networkInfo.data.latestLedger}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">RPC URL:</span>
                    <span className="text-white text-xs truncate max-w-32">{networkInfo.data.rpcUrl}</span>
                  </div>
                  <div className="text-xs text-gray-400 p-2 bg-gray-900/50 rounded font-mono break-all">
                    Passphrase: {networkInfo.data.passphrase}
                  </div>
                </div>
              ) : (
                <div className="text-red-400 text-sm p-2 bg-red-900/20 rounded">
                  {networkInfo.error || 'Failed to load network info'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Integration Summary */}
        <Card className="mt-6 bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white text-center">Integration Test Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-4">
                <div className="text-2xl font-bold mb-2">
                  {backendStatus.isConnected ? (
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                  ) : (
                    <XCircle className="h-8 w-8 text-red-500 mx-auto" />
                  )}
                </div>
                <div className="text-gray-300 text-sm">Backend API</div>
              </div>
              <div className="p-4">
                <div className="text-2xl font-bold mb-2">
                  {backendHealth.data ? (
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                  ) : (
                    <XCircle className="h-8 w-8 text-red-500 mx-auto" />
                  )}
                </div>
                <div className="text-gray-300 text-sm">Health Status</div>
              </div>
              <div className="p-4">
                <div className="text-2xl font-bold mb-2">
                  {contractStatus.data?.sorobanHealth?.isConnected ? (
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                  ) : (
                    <XCircle className="h-8 w-8 text-red-500 mx-auto" />
                  )}
                </div>
                <div className="text-gray-300 text-sm">Soroban Contracts</div>
              </div>
              <div className="p-4">
                <div className="text-2xl font-bold mb-2">
                  {networkInfo.data ? (
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                  ) : (
                    <XCircle className="h-8 w-8 text-red-500 mx-auto" />
                  )}
                </div>
                <div className="text-gray-300 text-sm">Network Info</div>
              </div>
            </div>
            
            <div className="mt-6 text-center">
              {backendStatus.isConnected && backendHealth.data && contractStatus.data && networkInfo.data ? (
                <Badge variant="default" className="bg-green-600 text-white px-6 py-2">
                  ✅ All Systems Operational - Frontend-Backend Integration Successful!
                </Badge>
              ) : (
                <Badge variant="destructive" className="px-6 py-2">
                  ❌ Integration Issues Detected - Check Components Above
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IntegrationTestComponent;