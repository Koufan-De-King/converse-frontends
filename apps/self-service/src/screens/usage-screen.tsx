import React, { useMemo } from 'react';
import { useQueryUsage } from '@lightbridge/hooks';
import type { UsageBackendUsageSeriesPoint } from '@lightbridge/api-rest';
import { UsageView } from '../views/usage-view';

export function UsageScreen() {
  const { data: trendData, isLoading: isTrendLoading } = useQueryUsage({ bucket: "1 day", limit: 30 });
  const { data: modelData, isLoading: isModelLoading } = useQueryUsage({ bucket: "30 days", groupBy: ["model"], limit: 50 });

  const totals = useMemo(() => {
    let cost = 0;
    let requests = 0;
    let tokens = 0;
    if (modelData?.points) {
      modelData.points.forEach(point => {
        // total_cost is delivered as microUSD from the backend
        cost += point.total_cost ? point.total_cost / 1_000_000 : 0;
        requests += point.requests ?? 0;
        tokens += point.total_tokens ?? 0;
      });
    }
    return { cost, requests, tokens };
  }, [modelData]);

  return (
    <UsageView 
      totals={totals}
      trendData={trendData}
      modelData={modelData}
      isTrendLoading={isTrendLoading}
      isModelLoading={isModelLoading}
    />
  );
}
