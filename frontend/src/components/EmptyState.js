export const EmptyState = ({ icon: Icon, title, description, className = 'py-16' }) => (
  <div className={`empty-state ${className}`}>
    {Icon && <Icon className="h-20 w-20 text-muted-foreground mb-4" />}
    {title && <h3 className="text-xl font-medium">{title}</h3>}
    {description && <p className="text-muted-foreground mt-2">{description}</p>}
  </div>
);
