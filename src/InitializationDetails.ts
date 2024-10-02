export type InitializationDetails = {
  duration: number;
  success: boolean;
  error?: Error;
  source?: InitializationSource;
};

export type InitializationSource = 'Network' | 'Bootstrap' | 'DataAdapter';
