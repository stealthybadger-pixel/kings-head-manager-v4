
import { useState, useCallback } from 'react';

export type BuilderLevel = 'dish' | 'recipe' | 'ingredient';

export interface BuilderSession {
  level: BuilderLevel;
  parentId?: string;
  initialData?: any;
  onComplete?: (newItemId: string, type: 'ingredient' | 'recipe') => void;
}

export const useRecursiveBuilder = () => {
  const [stack, setStack] = useState<BuilderSession[]>([]);

  const pushLevel = useCallback((level: BuilderLevel, initialData?: any, onComplete?: (id: string, type: 'ingredient' | 'recipe') => void) => {
    setStack(prev => [...prev, { level, initialData, onComplete }]);
  }, []);

  const popLevel = useCallback(() => {
    setStack(prev => prev.slice(0, -1));
  }, []);

  const clearStack = useCallback(() => {
    setStack([]);
  }, []);

  return {
    stack,
    pushLevel,
    popLevel,
    clearStack,
    isNested: stack.length > 0,
    currentLevel: stack[stack.length - 1],
    depth: stack.length
  };
};
