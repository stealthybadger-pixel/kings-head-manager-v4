import React from 'react';
import { Thermometer } from 'lucide-react';

export const FoodTempChecks: React.FC = () => {
  return (
    <div className="p-8 h-full overflow-y-auto bg-surface-container-lowest">
      <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-12">
        <div className="border-b border-outline-variant pb-6">
          <div className="flex items-center gap-3 text-primary">
            <Thermometer className="h-8 w-8" />
            <h1 className="display-lg text-on-surface font-bold">Food Temperature Checks</h1>
          </div>
          <p className="text-sm text-outline mt-2">
            Cooked core, reheat, hot hold, and delivery checks against today's items.
          </p>
        </div>
        <div className="bg-surface p-6 border border-outline-variant rounded-sm shadow-sm">
          <p className="text-sm text-on-surface-variant">
            Coming soon — manual temperature entry against today's checklist, with
            automatic Pass/Fail against stored thresholds.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FoodTempChecks;
