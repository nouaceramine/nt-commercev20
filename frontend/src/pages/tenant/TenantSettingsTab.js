import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Progress } from '../../components/ui/progress';
import { 
  CreditCard, Building, Database, HardDrive, 
  Download, FileText, RefreshCw, Activity, Archive 
} from 'lucide-react';

export function TenantSettingsTab({
  tenantData, dbInfo, dbLoading, backupLoading,
  handleRequestBackup, handleExportMyData, fetchDbInfo
}) {
  return (
    <div className="space-y-4" data-testid="tenant-settings-tab">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              معلومات الاشتراك
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">الخطة</p>
                <p className="font-semibold">{tenantData.plan_name || 'أساسية'}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">الحالة</p>
                <Badge variant="default">نشط</Badge>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">تاريخ الانتهاء</p>
                <p className="font-semibold">
                  {tenantData.subscription_ends_at 
                    ? new Date(tenantData.subscription_ends_at).toLocaleDateString('ar-DZ')
                    : 'غير محدد'}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">قاعدة البيانات</p>
                <p className="font-semibold text-xs">{tenantData.database_name || 'منفصلة'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              معلومات المتجر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">اسم المتجر</p>
                <p className="font-semibold">{tenantData.company_name || tenantData.name}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
                <p className="font-semibold">{tenantData.email}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">معرف المشترك</p>
                <p className="font-semibold text-xs">{tenantData.id || tenantData.tenant_id}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Database Management Card */}
      <Card className="border-2 border-blue-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            إدارة قاعدة البيانات
          </CardTitle>
          <CardDescription>
            عرض معلومات قاعدة بياناتك الخاصة وإدارة النسخ الاحتياطي
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-700">الحجم</span>
              </div>
              <p className="text-xl font-bold text-blue-800">
                {dbLoading ? '...' : `${dbInfo.size_mb} MB`}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-gradient-to-br from-green-50 to-green-100 border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700">السجلات</span>
              </div>
              <p className="text-xl font-bold text-green-800">
                {dbLoading ? '...' : dbInfo.documents_count?.toLocaleString()}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-purple-600" />
                <span className="text-sm text-purple-700">الجداول</span>
              </div>
              <p className="text-xl font-bold text-purple-800">
                {dbLoading ? '...' : dbInfo.collections_count}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <Archive className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-amber-700">آخر نسخة</span>
              </div>
              <p className="text-sm font-bold text-amber-800">
                {dbLoading ? '...' : (dbInfo.last_backup 
                  ? new Date(dbInfo.last_backup).toLocaleDateString('ar-DZ')
                  : 'لا يوجد')}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">استخدام التخزين</span>
              <span className="font-medium">{dbInfo.size_mb} MB من 500 MB</span>
            </div>
            <Progress value={(dbInfo.size_mb / 500) * 100} className="h-2" />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${dbInfo.status === 'healthy' ? 'bg-green-500' : dbInfo.is_frozen ? 'bg-blue-500' : 'bg-yellow-500'}`}></div>
              <div>
                <p className="font-medium">
                  {dbInfo.is_frozen ? 'قاعدة البيانات مجمدة' : dbInfo.status === 'healthy' ? 'قاعدة البيانات تعمل بشكل سليم' : 'يوجد تحذيرات'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dbInfo.is_frozen ? 'تواصل مع الدعم الفني لإلغاء التجميد' : 'جميع الخدمات متاحة'}
                </p>
              </div>
            </div>
            <Badge variant={dbInfo.is_frozen ? 'secondary' : 'default'} className={dbInfo.is_frozen ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}>
              {dbInfo.is_frozen ? 'مجمدة' : 'نشطة'}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleRequestBackup}
              disabled={backupLoading || dbInfo.is_frozen} className="gap-2">
              <Download className="h-4 w-4" />
              {backupLoading ? 'جاري الإرسال...' : 'طلب نسخة احتياطية'}
            </Button>
            <Button variant="outline" onClick={handleExportMyData}
              disabled={dbInfo.is_frozen} className="gap-2">
              <FileText className="h-4 w-4" />
              تصدير بياناتي (JSON)
            </Button>
            <Button variant="ghost" onClick={fetchDbInfo}
              disabled={dbLoading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${dbLoading ? 'animate-spin' : ''}`} />
              تحديث
            </Button>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
            <p className="text-sm text-blue-700">
              <strong>ملاحظة:</strong> يتم إنشاء نسخ احتياطية تلقائية يومياً. يمكنك طلب نسخة إضافية في أي وقت.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
