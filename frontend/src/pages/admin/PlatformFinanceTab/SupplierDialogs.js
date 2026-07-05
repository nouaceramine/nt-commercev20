/** Supplier CRUD + payment dialogs for the platform finance tab. */
import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { toast } from "sonner";
import apiClient from "../../../lib/apiClient";
import { Loader2, Plus, Banknote } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { fmt } from "./format";

export function SupplierFormDialog({ supplier, onClose, onDone }) {
  const [form, setForm] = useState({
    name: supplier?.name || "",
    phone: supplier?.phone || "",
    contact_person: supplier?.contact_person || "",
    notes: supplier?.notes || "",
    is_active: supplier?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const isEdit = !!supplier;

  const submit = async () => {
    if (!form.name.trim()) { toast.error("الاسم مطلوب"); return; }
    setBusy(true);
    try {
      if (isEdit) {
        await apiClient.put(`/admin/supplier/external-suppliers/${supplier.id}`, form);
      } else {
        await apiClient.post("/admin/supplier/external-suppliers", form);
      }
      toast.success(isEdit ? "تم التحديث" : "تمت الإضافة");
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الحفظ");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent dir="rtl" data-testid="supplier-form-dialog">
        <DialogHeader><DialogTitle>{isEdit ? "تعديل المورد" : "إضافة مورد خارجي"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>الاسم *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="supplier-name" /></div>
          <div><Label>الهاتف</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="supplier-phone" /></div>
          <div><Label>اسم المسؤول</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div><Label>ملاحظات</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={busy} data-testid="supplier-save-btn">
            {busy ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : <Plus className="h-4 w-4 ms-1" />} حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Purchase dialog ─────────────────────────────────────────────────────
export function PaymentDialog({ supplier, onClose, onDone }) {
  const [amount, setAmount] = useState(supplier.balance_due || 0);
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!amount || Number(amount) <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    setBusy(true);
    try {
      const res = await apiClient.post(`/admin/supplier/external-suppliers/${supplier.id}/payments`, {
        amount: Number(amount), method, notes,
      });
      toast.success(`تمَّ تسجيل دفعة ${fmt(amount)} دج — الرصيد الجديد: ${fmt(res.data.new_balance_due)} دج`);
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent dir="rtl" data-testid="payment-dialog">
        <DialogHeader><DialogTitle>تسجيل دفعة لـ {supplier.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm bg-amber-50 border border-amber-200 rounded p-2">
            الرصيد الحالي المستحَق علينا: <strong className="text-amber-800">{fmt(supplier.balance_due)} دج</strong>
          </div>
          <div><Label>المبلغ المدفوع *</Label><Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="payment-amount" /></div>
          <div>
            <Label>طريقة الدفع</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="transfer">تحويل بنكي</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>ملاحظات</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={busy} data-testid="payment-save-btn">
            {busy ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : <Banknote className="h-4 w-4 ms-1" />} تسجيل الدفعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Upload codes/ICCIDs against a saved purchase (deferred upload) ──────
