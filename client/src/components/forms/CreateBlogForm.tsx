import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/TextArea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { useToast } from "@/hooks/useToast";
import { createBlog } from "@/lib/apiClient";
import { BlogPostCategory, IBlogPost } from "@/types/apiTypes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";

interface CreateBlogFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBlogForm({ open, onOpenChange }: CreateBlogFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, reset, watch } = useForm<Partial<IBlogPost>>({
    defaultValues: {
      category: 'personal-growth',
      tags: [],
    }
  });

  const selectedCategory = watch("category");
  const tagsString = watch("tags")?.join(", ") || "";

  const mutation = useMutation({
    mutationFn: createBlog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blogs"] });
      toast({
        title: "Success",
        description: "Your blog post has been created and published.",
      });
      reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create blog post",
        variant: "destructive",
      });
    },
    onSettled: () => setIsSubmitting(false),
  });

  const onSubmit = (data: Partial<IBlogPost>) => {
    setIsSubmitting(true);
    // Transform tags string to array
    const tagsArray = typeof data.tags === 'string' 
        ? (data.tags as string).split(',').map(t => t.trim()).filter(Boolean)
        : data.tags;

    // Provide a default cover image if none provided
    const finalData = {
        ...data,
        tags: tagsArray,
        coverImage: data.coverImage || "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80",
    };
    
    mutation.mutate(finalData);
  };

  const categories: {value: BlogPostCategory, label: string}[] = [
    { value: 'investing', label: 'Investing' },
    { value: 'budgeting', label: 'Budgeting' },
    { value: 'tax-planning', label: 'Tax Planning' },
    { value: 'debt-management', label: 'Debt Management' },
    { value: 'retirement', label: 'Retirement' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'real-estate', label: 'Real Estate' },
    { value: 'market-news', label: 'Market News' },
    { value: 'personal-growth', label: 'Personal Growth' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Write a Blog Post</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input 
              id="title" 
              placeholder="E.g., 5 Ways to Save on Taxes in 2026" 
              {...register("title", { required: "Title is required", minLength: { value: 5, message: "Title must be at least 5 characters"} })}
            />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="excerpt">Excerpt *</Label>
            <Textarea 
              id="excerpt" 
              placeholder="A short summary of your post (max 300 characters)" 
              className="h-20"
              {...register("excerpt", { 
                required: "Excerpt is required", 
                maxLength: { value: 300, message: "Excerpt cannot exceed 300 characters"} 
              })}
            />
            {errors.excerpt && <p className="text-sm text-destructive">{errors.excerpt.message}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={selectedCategory}
                  onValueChange={(val: BlogPostCategory) => setValue("category", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="coverImage">Cover Image URL</Label>
                <Input 
                  id="coverImage" 
                  placeholder="https://example.com/image.jpg" 
                  {...register("coverImage")}
                />
              </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags (comma separated)</Label>
            <Input 
              id="tags" 
              placeholder="e.g., investing, beginners, tips" 
              value={tagsString}
              onChange={(e) => {
                  // We temporarily store it as a string here before submitting
                  setValue("tags", e.target.value as any)
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content (Markdown) *</Label>
            <Textarea 
              id="content" 
              placeholder="Write your article here using Markdown..." 
              className="min-h-[300px] font-mono"
              {...register("content", { required: "Content is required" })}
            />
            {errors.content && <p className="text-sm text-destructive">{errors.content.message}</p>}
            <p className="text-xs text-muted-foreground mt-1 text-right">Styling supports Markdown (## Headers, **bold**, *italics*, - lists).</p>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                "Publish Post"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
