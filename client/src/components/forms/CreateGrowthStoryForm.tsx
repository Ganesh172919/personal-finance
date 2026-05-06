/**
 * @fileoverview CreateGrowthStoryForm — multi-section dialog form for submitting a personal
 * financial transformation story with metrics, narrative, and categorisation.
 *
 * WHAT IT DOES
 *  - Renders inside a `Dialog` (controlled by `open`/`onOpenChange`) with a scrollable body.
 *  - Four sections: (1) Basics (title, persona, location, summary), (2) Financial Metrics
 *    (starting/current net worth, monthly income, savings rate, debt paid off, investment
 *    returns, timeline, outcome), (3) The Journey (challenge description, detailed Markdown
 *    story), (4) Categorisation (category, difficulty, strategies, tags).
 *  - Uses `react-hook-form` with `register` for all fields; strategies and tags are
 *    comma-separated strings converted to arrays on submit.
 *  - Default financialMetrics are zeroed; default cover image is provided if none entered.
 *
 * KEY PROPS & DATA FLOW
 *  - `open` (boolean) — controls dialog visibility.
 *  - `onOpenChange` ((open: boolean) => void) — callback to toggle dialog state.
 *  - Mutation: `createGrowthStory` from `@/lib/apiClient`.
 *  - Category options: 7 categories (debt-freedom, wealth-building, early-retirement, etc.).
 *  - Difficulty levels: beginner, intermediate, advanced.
 *
 * ARCHITECTURE NOTES
 *  - Opened from the /growth-stories page "Share Your Story" button.
 *  - The form uses `id="growth-story-form"` with a submit button outside the scroll area
 *    so the user can submit without scrolling back to the top.
 *  - Financial metrics are converted back to numbers on submit to handle string inputs
 *    from number-type input fields.
 */
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
import { createGrowthStory } from "@/lib/apiClient";
import { GrowthStoryCategory, GrowthStoryDifficulty, IGrowthStory } from "@/types/apiTypes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";

interface CreateGrowthStoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateGrowthStoryForm({ open, onOpenChange }: CreateGrowthStoryFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, reset, watch } = useForm<Partial<IGrowthStory>>({
    defaultValues: {
      category: 'wealth-building',
      difficulty: 'beginner',
      tags: [],
      strategies: [],
      financialMetrics: {
          startingNetWorth: 0,
          currentNetWorth: 0,
          monthlyIncome: 0,
          savingsRate: 0,
          debtPaidOff: 0,
          investmentReturns: 0
      }
    }
  });

  const selectedCategory = watch("category");
  const selectedDifficulty = watch("difficulty");
  const tagsString = watch("tags")?.join(", ") || "";
  const strategiesString = watch("strategies")?.join(", ") || "";

  const mutation = useMutation({
    mutationFn: createGrowthStory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["growth-stories"] });
      toast({
        title: "Success",
        description: "Your growth story has been published.",
      });
      reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit story",
        variant: "destructive",
      });
    },
    onSettled: () => setIsSubmitting(false),
  });

  const onSubmit = (data: Partial<IGrowthStory>) => {
    setIsSubmitting(true);
    
    const tagsArray = typeof data.tags === 'string' 
        ? (data.tags as string).split(',').map(t => t.trim()).filter(Boolean)
        : data.tags;
        
    const strategiesArray = typeof data.strategies === 'string' 
        ? (data.strategies as string).split(',').map(t => t.trim()).filter(Boolean)
        : data.strategies;

    // Convert financial metrics back to numbers
    const metrics: any = data.financialMetrics || {};
    Object.keys(metrics).forEach(key => {
        metrics[key] = Number(metrics[key] || 0);
    });

    const finalData = {
        ...data,
        tags: tagsArray,
        strategies: strategiesArray,
        financialMetrics: metrics,
        coverImage: data.coverImage || "https://images.unsplash.com/photo-1573164713988-8665fc963095?ixlib=rb-4.0.3&auto=format&fit=crop&w=1469&q=80",
    };
    
    mutation.mutate(finalData);
  };

  const categories: {value: GrowthStoryCategory, label: string}[] = [
    { value: 'debt-freedom', label: 'Debt Freedom' },
    { value: 'wealth-building', label: 'Wealth Building' },
    { value: 'early-retirement', label: 'Early Retirement' },
    { value: 'side-hustle', label: 'Side Hustle' },
    { value: 'tax-optimization', label: 'Tax Optimization' },
    { value: 'family-finance', label: 'Family Finance' },
    { value: 'student-finance', label: 'Student Finance' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-2xl font-bold">Share Your Growth Story</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 px-6 py-4">
            <form id="growth-story-form" onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            
            {/* Section 1: Core Details */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b border-border pb-2">1. The Basics</h3>
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="title">Headline *</Label>
                        <Input 
                        id="title" 
                        placeholder="E.g., How I Paid Off ₹10 Lakhs Debt in 2 Years" 
                        {...register("title", { required: "Headline is required" })}
                        />
                        {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="persona">Your Persona *</Label>
                            <Input id="persona" placeholder="E.g., 28-year-old Teacher" {...register("persona", { required: "Persona is required" })} />
                        </div>
                        <div>
                            <Label htmlFor="location">Location *</Label>
                            <Input id="location" placeholder="E.g., Mumbai" {...register("location", { required: "Location is required" })} />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="summary">One-line Summary *</Label>
                        <Input id="summary" placeholder="A brief 1-line summary of the transformation" {...register("summary", { required: "Summary is required" })} />
                    </div>
                </div>
            </div>

            {/* Section 2: Financial Metrics */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b border-border pb-2">2. Financial Metrics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <Label>Starting Net Worth (₹)</Label>
                        <Input type="number" {...register("financialMetrics.startingNetWorth")} placeholder="0" />
                    </div>
                    <div>
                        <Label>Current Net Worth (₹)</Label>
                        <Input type="number" {...register("financialMetrics.currentNetWorth")} placeholder="0" />
                    </div>
                    <div>
                        <Label>Monthly Income (₹)</Label>
                        <Input type="number" {...register("financialMetrics.monthlyIncome")} placeholder="0" />
                    </div>
                    <div>
                        <Label>Savings Rate (%)</Label>
                        <Input type="number" {...register("financialMetrics.savingsRate")} placeholder="0" />
                    </div>
                    <div>
                        <Label>Debt Paid Off (₹)</Label>
                        <Input type="number" {...register("financialMetrics.debtPaidOff")} placeholder="0" />
                    </div>
                    <div>
                        <Label>Inv. Returns (%)</Label>
                        <Input type="number" step="0.1" {...register("financialMetrics.investmentReturns")} placeholder="0" />
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div>
                        <Label htmlFor="timeline">Timeline to achieve this *</Label>
                        <Input id="timeline" placeholder="E.g., 2 Years or 18 Months" {...register("timeline", { required: "Timeline is required" })} />
                    </div>
                    <div>
                        <Label htmlFor="outcome">Specific Outcome *</Label>
                        <Input id="outcome" placeholder="E.g., Debt-free and building wealth" {...register("outcome", { required: "Outcome is required" })} />
                    </div>
                </div>
            </div>

            {/* Section 3: The Story */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b border-border pb-2">3. The Journey</h3>
                
                <div>
                    <Label htmlFor="challenge">The Challenge / Starting Point *</Label>
                    <Textarea 
                        id="challenge" 
                        placeholder="Describe where you started from and the financial problems you faced..." 
                        {...register("challenge", { required: "Challenge is required" })} 
                        className="h-24"
                    />
                </div>
                
                <div>
                    <Label htmlFor="journey">The Detailed Story (Markdown) *</Label>
                    <Textarea 
                        id="journey" 
                        placeholder="Share the detailed story here, including strategies used..." 
                        {...register("journey", { required: "Journey details are required" })} 
                        className="h-48 font-mono"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Supports Markdown format.</p>
                </div>
            </div>

            {/* Section 4: Metadata */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b border-border pb-2">4. Categorization</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label>Category *</Label>
                        <Select value={selectedCategory} onValueChange={(val: GrowthStoryCategory) => setValue("category", val)}>
                        <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                        <SelectContent>
                            {categories.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
                        </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Difficulty Level *</Label>
                        <Select value={selectedDifficulty} onValueChange={(val: GrowthStoryDifficulty) => setValue("difficulty", val)}>
                        <SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="beginner">Beginner</SelectItem>
                            <SelectItem value="intermediate">Intermediate</SelectItem>
                            <SelectItem value="advanced">Advanced</SelectItem>
                        </SelectContent>
                        </Select>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="strategies">Strategies Used (comma separated)</Label>
                        <Input 
                            id="strategies" 
                            placeholder="e.g., SIP, 50-30-20 Rule" 
                            value={strategiesString}
                            onChange={(e) => setValue("strategies", e.target.value as any)}
                        />
                    </div>
                    <div>
                        <Label htmlFor="tags">Tags (comma separated)</Label>
                        <Input 
                            id="tags" 
                            placeholder="e.g., finance, motivation" 
                            value={tagsString}
                            onChange={(e) => setValue("tags", e.target.value as any)}
                        />
                    </div>
                </div>
            </div>

            </form>
        </ScrollArea>

        <div className="px-6 py-4 border-t border-border flex justify-end space-x-3 bg-muted/20">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="growth-story-form" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing...</>
              ) : (
                "Publish Story"
              )}
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
