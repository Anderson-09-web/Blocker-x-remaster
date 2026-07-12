import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Pencil, Trash2, FolderOpen, Eye } from "lucide-react";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Error en la petición");
  }
  return res.json();
}

interface DocData {
  id: string;
  title: string;
  content: string;
  category: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface DocFormData {
  title: string;
  content: string;
  category: string;
  order: string;
}

const defaultForm: DocFormData = {
  title: "",
  content: "",
  category: "general",
  order: "0",
};

function groupByCategory(docs: DocData[]): Record<string, DocData[]> {
  return docs.reduce(
    (acc, doc) => {
      const cat = doc.category || "general";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(doc);
      return acc;
    },
    {} as Record<string, DocData[]>
  );
}

export default function AdminDocsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<DocData | null>(null);
  const [viewDoc, setViewDoc] = useState<DocData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocData | null>(null);
  const [form, setForm] = useState<DocFormData>(defaultForm);

  const { data, isLoading } = useQuery<{ docs: DocData[] }>({
    queryKey: ["admin-docs"],
    queryFn: () => apiFetch("/admin/docs"),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch("/admin/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Documento creado" });
      qc.invalidateQueries({ queryKey: ["admin-docs"] });
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      apiFetch(`/admin/docs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Documento actualizado" });
      qc.invalidateQueries({ queryKey: ["admin-docs"] });
      setDialogOpen(false);
      setEditDoc(null);
      setForm(defaultForm);
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/docs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Documento eliminado" });
      qc.invalidateQueries({ queryKey: ["admin-docs"] });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditDoc(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(doc: DocData) {
    setEditDoc(doc);
    setForm({
      title: doc.title,
      content: doc.content,
      category: doc.category,
      order: String(doc.order),
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const body = {
      title: form.title,
      content: form.content,
      category: form.category || "general",
      order: parseInt(form.order) || 0,
    };
    if (editDoc) {
      updateMutation.mutate({ id: editDoc.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  const docs = data?.docs ?? [];
  const grouped = groupByCategory(docs);
  const categories = Object.keys(grouped).sort();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Documentación Interna
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Artículos internos de administración. Solo visible para admins.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Nuevo artículo
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total artículos", value: docs.length },
          { label: "Categorías", value: categories.length },
          { label: "Último actualizado", value: docs.length > 0 ? new Date(docs[0].updatedAt).toLocaleDateString("es") : "—" },
        ].map((s) => (
          <Card key={s.label} className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No hay documentos todavía</p>
            <p className="text-sm text-muted-foreground/60">Crea artículos internos para el equipo admin.</p>
            <Button onClick={openCreate} variant="outline" className="mt-2 gap-2">
              <Plus className="w-4 h-4" />
              Crear primer artículo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen className="w-4 h-4 text-primary" />
                <h2 className="font-semibold capitalize text-foreground">{cat}</h2>
                <Badge variant="secondary" className="text-xs">{grouped[cat].length}</Badge>
              </div>
              <div className="grid gap-3">
                <>
                  {grouped[cat]
                    .sort((a, b) => a.order - b.order)
                    .map((doc) => (
                      <div key={doc.id}>
                        <Card className="hover:border-primary/30 transition-colors">
                          <CardContent className="pt-4 pb-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-semibold text-sm truncate">{doc.title}</h3>
                                  {doc.order > 0 && (
                                    <Badge variant="outline" className="text-xs shrink-0">#{doc.order}</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 font-mono">
                                  {doc.content.slice(0, 150)}{doc.content.length > 150 ? "…" : ""}
                                </p>
                                <p className="text-xs text-muted-foreground/60 mt-2">
                                  Actualizado: {new Date(doc.updatedAt).toLocaleDateString("es", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-8 h-8"
                                  onClick={() => setViewDoc(doc)}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-8 h-8"
                                  onClick={() => openEdit(doc)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteTarget(doc)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                </>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editDoc ? "Editar artículo" : "Nuevo artículo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input
                placeholder="Nombre del artículo"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Input
                  placeholder="general, api, setup…"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Orden (número)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.order}
                  onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Contenido (Markdown)</Label>
              <Textarea
                placeholder="# Título&#10;&#10;Escribe aquí el contenido del artículo en Markdown..."
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={12}
                className="font-mono text-sm resize-y"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending || !form.title || !form.content}
            >
              {editDoc ? "Guardar cambios" : "Crear artículo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewDoc} onOpenChange={() => setViewDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              {viewDoc?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="flex gap-2 mb-4">
              <Badge variant="outline">{viewDoc?.category}</Badge>
              {(viewDoc?.order ?? 0) > 0 && <Badge variant="secondary">#{viewDoc?.order}</Badge>}
            </div>
            <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed bg-muted/30 rounded-lg p-4 border border-border">
              {viewDoc?.content}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setViewDoc(null); if (viewDoc) openEdit(viewDoc); }}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar
            </Button>
            <Button onClick={() => setViewDoc(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar artículo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente "<strong>{deleteTarget?.title}</strong>". Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
