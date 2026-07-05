/** Purchase creation + deferred code upload dialogs. */
import { useState, useEffect, useMemo } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Badge } from "../../../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { toast } from "sonner";
import apiClient from "../../../lib/apiClient";
import { Loader2, Plus, Trash2, Upload, FileText, AlertTriangle, Receipt } from "lucide-react";
import { fmt } from "./format";

export function PurchaseFormDialog({ suppliers, onClose, onDone }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [items, setItems] = useState([{ label: "", quantity: 1, unit_cost: 0, type: "card", catalog_id: null }]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [catalogs, setCatalogs] = useState({ card: [], sim: [], idoom: [], iptv: [] });

  // Load catalog options (cards / sims / idoom / iptv) for the dropdown
  useEffect(() => {
    apiClient.get("/admin/supplier/catalog-reference")
      .then(res => setCatalogs(res.data || { card: [], sim: [], idoom: [], iptv: [] }))
      .catch(() => {/* graceful — manual label entry still works */});
  }, []);

  const total = useMemo(
    () => items.reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.unit_cost || 0)), 0),
    [items],
  );
  const balance = Math.max(0, total - Number(paidAmount || 0));

  const updateItem = (i, k, v) => setItems(items.map((it, idx) => {
    if (idx !== i) return it;
    const next = { ...it, [k]: v };
    // When type changes, reset catalog_id so the user re-picks from the right list
    if (k === "type") next.catalog_id = null;
    return next;
  }));
  const addItem = () => setItems([...items, { label: "", quantity: 1, unit_cost: 0, type: "card", catalog_id: null }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const onPickCatalog = (i, value) => {
    // value is "NONE" (free entry) or the catalog item id
    if (value === "NONE") {
      updateItem(i, "catalog_id", null);
      return;
    }
    const type = items[i].type;
    const found = (catalogs[type] || []).find(x => x.id === value);
    setItems(prev => prev.map((it, idx) => idx === i
      ? { ...it, catalog_id: value, label: found?.label || it.label }
      : it));
  };

  const submit = async () => {
    if (!supplierId) { toast.error("اختر المورد"); return; }
    const validItems = items.filter(it => Number(it.quantity) > 0 && Number(it.unit_cost) >= 0 && it.label.trim());
    if (validItems.length === 0) { toast.error("أضف بنداً واحداً على الأقل"); return; }
    setBusy(true);
    try {
      await apiClient.post("/admin/supplier/purchases", {
        supplier_id: supplierId,
        items: validItems.map(it => ({
          type: it.type,
          catalog_id: it.catalog_id || null,
          label: it.label.trim(),
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost),
        })),
        paid_amount: Number(paidAmount || 0),
        notes,
      });
      toast.success("تمَّ تسجيل عملية الشراء");
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الحفظ");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="purchase-form-dialog">
        <DialogHeader><DialogTitle>تسجيل عملية شراء من مورد</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>المورد *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger data-testid="purchase-supplier-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {suppliers.filter(s => s.is_active).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">البنود المشتراة</span>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 ms-1" /> سطر</Button>
            </div>
            {items.map((it, i) => {
              const opts = catalogs[it.type] || [];
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-end border-b pb-2">
                  <div className="col-span-2">
                    <Label className="text-xs">النوع</Label>
                    <Select value={it.type} onValueChange={(v) => updateItem(i, "type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="card">💳 بطاقة شحن</SelectItem>
                        <SelectItem value="sim">📱 شريحة SIM</SelectItem>
                        <SelectItem value="idoom">🌐 Idoom</SelectItem>
                        <SelectItem value="iptv">📺 IPTV</SelectItem>
                        <SelectItem value="other">📦 أخرى</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Label className="text-xs">الفئة (من الكاتالوج)</Label>
                    {opts.length > 0 ? (
                      <Select value={it.catalog_id || "NONE"} onValueChange={(v) => onPickCatalog(i, v)}>
                        <SelectTrigger data-testid={`purchase-item-catalog-${i}`}><SelectValue placeholder="اختر..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">— إدخال يدوي —</SelectItem>
                          {opts.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={it.label} onChange={(e) => updateItem(i, "label", e.target.value)} placeholder="مثلاً Mobilis 1000" />
                    )}
                  </div>
                  <div className="col-span-2"><Label className="text-xs">الكمية</Label><Input type="number" min="1" value={it.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} /></div>
                  <div className="col-span-3"><Label className="text-xs">سعر الوحدة (دج)</Label><Input type="number" min="0" value={it.unit_cost} onChange={(e) => updateItem(i, "unit_cost", e.target.value)} /></div>
                  <div className="col-span-1">
                    <Button size="sm" variant="ghost" disabled={items.length === 1} onClick={() => removeItem(i)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                  </div>
                  {it.catalog_id && ["card", "sim", "idoom"].includes(it.type) && (
                    <div className="col-span-12 text-[11px] text-emerald-700 -mt-1">
                      ✓ مرتبط بالكاتالوج — يمكنك رفع {it.type === "sim" ? "ملف ICCID" : "ملف الأكواد"} لاحقاً من جدول المشتريات.
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>المبلغ المدفوع الآن</Label>
              <Input type="number" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} data-testid="purchase-paid" />
            </div>
            <div className="flex flex-col justify-end text-right">
              <div className="text-sm text-muted-foreground">الإجمالي: <strong className="text-foreground">{fmt(total)} دج</strong></div>
              <div className="text-base font-bold text-amber-700">المتبقي على المنصة: {fmt(balance)} دج</div>
            </div>
          </div>

          <div><Label>ملاحظات</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={busy} data-testid="purchase-save-btn">
            {busy ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : <Receipt className="h-4 w-4 ms-1" />} حفظ عملية الشراء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Payment dialog ──────────────────────────────────────────────────────
const TYPE_LABEL = { card: "بطاقات شحن", sim: "شرائح SIM", idoom: "أكواد Idoom" };

export function UploadCodesForPurchaseDialog({ purchase, onClose, onDone }) {
  const uploadable = (purchase.items || [])
    .map((it, idx) => ({ ...it, idx }))
    .filter(it => ["card", "sim", "idoom"].includes(it.type) && it.catalog_id);

  const [selectedIdx, setSelectedIdx] = useState(uploadable[0]?.idx ?? null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = uploadable.find(it => it.idx === selectedIdx);

  const submit = async () => {
    if (selectedIdx === null) { toast.error("اختر بنداً"); return; }
    const codes = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (codes.length === 0) { toast.error("الصق أكواداً أولاً"); return; }
    setBusy(true);
    try {
      const params = new URLSearchParams({ item_index: String(selectedIdx), codes_text: text });
      const res = await apiClient.post(
        `/admin/supplier/purchases/${purchase.id}/upload-codes?${params.toString()}`,
      );
      const { inserted, skipped, total_so_far, expected } = res.data || {};
      toast.success(`✅ تمَّ رفع ${inserted} كود (تخطّي ${skipped}). الإجمالي: ${total_so_far}/${expected}`);
      setText("");
      // If user has finished uploading all items, close. Otherwise stay open.
      if (uploadable.length === 1) onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الرفع");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-xl" data-testid="upload-codes-purchase-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-emerald-600" /> رفع أكواد لعملية شراء
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs bg-slate-100 rounded p-2">
            عملية الشراء: <strong>{purchase.supplier_name}</strong> — تاريخ {purchase.purchase_date?.slice(0, 10)} —
            <strong> {fmt(purchase.total_cost)} دج</strong>
          </div>

          {uploadable.length === 0 ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 flex gap-2 items-start">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              لا توجد بنود قابلة لرفع الأكواد في هذه العملية. (يجب أن يكون النوع: بطاقة/شريحة/Idoom <strong>ومُختار من الكاتالوج</strong>.)
            </div>
          ) : (
            <>
              <div>
                <Label>اختر البند</Label>
                <Select value={selectedIdx !== null ? String(selectedIdx) : ""} onValueChange={(v) => setSelectedIdx(Number(v))}>
                  <SelectTrigger data-testid="upload-codes-item-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {uploadable.map(it => {
                      const so_far = Number(it.codes_uploaded || 0);
                      const expected = Number(it.quantity || 0);
                      const remaining = Math.max(0, expected - so_far);
                      return (
                        <SelectItem key={it.idx} value={String(it.idx)}>
                          {TYPE_LABEL[it.type]} — {it.label} ({so_far}/{expected} مرفوع، يتبقى {remaining})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {selected && (
                <div className="text-[11px] text-emerald-700 bg-emerald-50 rounded p-2">
                  📊 المتوقع: <strong>{selected.quantity}</strong> &nbsp;|&nbsp;
                  المرفوع حتى الآن: <strong>{selected.codes_uploaded || 0}</strong> &nbsp;|&nbsp;
                  المتبقي: <strong>{Math.max(0, Number(selected.quantity || 0) - Number(selected.codes_uploaded || 0))}</strong>
                </div>
              )}

              <div>
                <Label className="flex items-center gap-1">
                  <FileText className="h-3 w-3" /> الأكواد / ICCIDs (كود واحد في كل سطر)
                </Label>
                <textarea
                  rows={10}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full border rounded p-2 font-mono text-sm"
                  placeholder="123456789012345&#10;987654321098765&#10;# الأسطر التي تبدأ بـ # يتم تجاهلها"
                  data-testid="upload-codes-textarea"
                />
                <div className="text-[11px] text-muted-foreground mt-1">
                  💡 يمكنك أيضاً سحب وإفلات محتوى ملف نصي مباشرة، أو لصق قائمة من Excel.
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <input
                  type="file"
                  accept=".txt,.csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const content = await f.text();
                    setText(prev => (prev ? prev + "\n" : "") + content);
                  }}
                  className="text-xs"
                  data-testid="upload-codes-file"
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          {uploadable.length > 0 && (
            <Button onClick={submit} disabled={busy || !text.trim()} data-testid="upload-codes-submit">
              {busy ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : <Upload className="h-4 w-4 ms-1" />} رفع
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ── Code Trace Card — search any code/ICCID and see its full journey ────
