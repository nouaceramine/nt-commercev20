export const LoadingState = ({ minHeight, className = '' }) => (
  <div
    className={`flex items-center justify-center ${className}`}
    style={minHeight ? { minHeight } : undefined}
  >
    <div className="spinner" />
  </div>
);
