import { OpenAI } from 'openai';
import { 
  AIServiceConfig,
  CodeReviewRequest,
  Review,
  TokenUsage,
  ReviewSchema
} from './types';
import { PromptTemplates } from './prompts';
import { CostCalculator } from './cost-calculator';
import { ContextManager } from './context-manager';
import { EnhancedContextManager, ChunkStrategy } from './enhanced-context-manager';
import { TokenOptimizer, OptimizationStrategy } from './token-optimizer';
import { InMemoryCostTracker } from './cost-tracker-memory';
import { RetryManager } from './retry-manager';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<AIServiceConfig> = {
  model: 'gpt-4-turbo-preview',
  temperature: 0.3,
  maxTokens: 4000,
  contextWindowSize: 128000,
  enableFunctionCalling: true,
  enableEnhancedContext: true,
  prioritizeSecurityIssues: true,
  retry: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitterFactor: 0.1
  }
};

/**
 * Enhanced AI service with intelligent context management
 */
export class EnhancedAIService {
  private client: OpenAI;
  private config: AIServiceConfig;
  private contextManager: ContextManager;
  private enhancedContextManager: EnhancedContextManager;
  private tokenOptimizer: TokenOptimizer;
  private costTracker: InMemoryCostTracker;
  private retryManager: RetryManager;
  private totalCost: number = 0;

  constructor(config: AIServiceConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.client = new OpenAI({
      apiKey: this.config.apiKey
    });
    
    // Initialize context managers
    this.contextManager = new ContextManager(
      this.config.model,
      this.config.maxTokens
    );
    
    this.enhancedContextManager = new EnhancedContextManager({
      model: this.config.model,
      contextWindowSize: this.config.contextWindowSize,
      reservedTokens: this.config.maxTokens || 4000,
      enableSmartChunking: true,
      prioritizeSecurityIssues: this.config.prioritizeSecurityIssues !== false
    });
    
    this.tokenOptimizer = new TokenOptimizer();
    this.costTracker = new InMemoryCostTracker();
    this.retryManager = new RetryManager(this.config.retry);
  }

  /**
   * Review code changes with enhanced context management
   */
  async reviewCode(request: CodeReviewRequest): Promise<Review> {
    try {
      // Check cost limit before making request
      if (this.config.costLimit && this.totalCost >= this.config.costLimit) {
        throw new Error(`Cost limit exceeded: ${CostCalculator.formatCost(this.totalCost)} >= ${CostCalculator.formatCost(this.config.costLimit)}`);
      }

      // Use enhanced context management if enabled
      if (this.config.enableEnhancedContext) {
        return await this.reviewWithEnhancedContext(request);
      } else {
        return await this.reviewWithStandardContext(request);
      }
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Review with enhanced context management
   */
  private async reviewWithEnhancedContext(request: CodeReviewRequest): Promise<Review> {
    // Analyze and chunk the request
    const analysis = this.enhancedContextManager.analyzeAndChunk(
      request.changes,
      request.findings,
      {
        systemPromptTokens: 500,
        forceIncludeFiles: request.context?.criticalFiles
      }
    );

    console.log(`Enhanced context analysis:`, {
      totalChanges: analysis.summary.totalChanges,
      totalFindings: analysis.summary.totalFindings,
      criticalFindings: analysis.summary.criticalFindings,
      chunks: analysis.chunks.length,
      strategy: analysis.summary.recommendedStrategy
    });

    // If everything fits in one chunk, process normally
    if (analysis.chunks.length === 1) {
      const chunk = analysis.chunks[0];
      const chunkRequest: CodeReviewRequest = {
        ...request,
        changes: chunk.changes,
        findings: chunk.findings
      };
      
      return await this.generateReviewWithRetry(chunkRequest);
    }

    // Process multiple chunks
    console.log(`Processing ${analysis.chunks.length} chunks with ${analysis.summary.recommendedStrategy} strategy`);
    
    const reviews: Review[] = [];
    let totalCost = 0;

    for (let i = 0; i < analysis.chunks.length; i++) {
      const chunk = analysis.chunks[i];
      console.log(`Processing chunk ${i + 1}/${analysis.chunks.length}: ${chunk.description} (priority: ${chunk.priority})`);
      
      const chunkRequest: CodeReviewRequest = {
        ...request,
        changes: chunk.changes,
        findings: chunk.findings,
        context: {
          ...request.context,
          chunkInfo: {
            current: i + 1,
            total: analysis.chunks.length,
            description: chunk.description,
            priority: chunk.priority
          }
        }
      };

      try {
        const review = await this.generateReviewWithRetry(chunkRequest);
        reviews.push(review);
        totalCost += review.usage.estimatedCost;

        // Check cumulative cost
        if (this.config.costLimit && totalCost > this.config.costLimit) {
          console.warn(
            `Stopping chunk processing: cost limit reached ` +
            `(${CostCalculator.formatCost(totalCost)} > ` +
            `${CostCalculator.formatCost(this.config.costLimit)})`
          );
          break;
        }
      } catch (error) {
        console.error(`Failed to process chunk ${i + 1}: ${error}`);
        // Continue with other chunks if one fails
      }
    }

    // Merge reviews from all chunks
    return this.mergeChunkReviews(reviews, analysis);
  }

  /**
   * Review with standard context management (fallback)
   */
  private async reviewWithStandardContext(request: CodeReviewRequest): Promise<Review> {
    // Apply token optimization if enabled
    let optimizedChanges = request.changes;
    let optimizedFindings = request.findings;
    
    if (this.config.enableTokenOptimization) {
      const optimization = this.tokenOptimizer.optimize(
        request.changes,
        request.findings,
        {
          strategies: [
            OptimizationStrategy.REMOVE_WHITESPACE,
            OptimizationStrategy.SEMANTIC_SLICING
          ],
          ...(this.config.maxTokens ? { maxTokens: this.config.maxTokens * 0.8 } : {}),
          minSeverity: 'medium'
        }
      );
      
      optimizedChanges = optimization.changes;
      optimizedFindings = optimization.findings;
      
      if (optimization.metrics.reductionPercentage > 10) {
        console.log(
          `Token optimization: ${optimization.metrics.reductionPercentage}% reduction ` +
          `(${optimization.metrics.originalTokens} → ${optimization.metrics.optimizedTokens} tokens)`
        );
      }
    }
    
    // Check if changes fit in context window
    const contextAnalysis = this.contextManager.prioritizeChanges(
      optimizedChanges,
      optimizedFindings
    );
    
    // If changes were excluded, add note to request
    if (contextAnalysis.excludedChanges.length > 0) {
      console.warn(
        `Context window limit: ${contextAnalysis.excludedChanges.length} files excluded from review`
      );
    }
    
    // Update request with optimized and prioritized changes
    const optimizedRequest: CodeReviewRequest = {
      ...request,
      changes: contextAnalysis.includedChanges,
      findings: optimizedFindings
    };
    
    return await this.generateReviewWithRetry(optimizedRequest);
  }

  /**
   * Generate review with enhanced retry logic
   */
  private async generateReviewWithRetry(request: CodeReviewRequest): Promise<Review> {
    return await this.retryManager.executeWithRetry(
      async () => {
        const systemPrompt = PromptTemplates.getSystemPrompt();
        const userPrompt = PromptTemplates.createReviewPrompt(request);
        
        const response = await this.callOpenAI(systemPrompt, userPrompt);
        
        // Parse and validate response
        const reviewData = this.parseResponse(response);
        
        // Add usage information
        const usage = response.usage;
        const tokenUsage: TokenUsage = {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
          model: response.model,
          estimatedCost: 0
        };
        
        // Calculate cost
        const cost = CostCalculator.calculateCost(tokenUsage);
        tokenUsage.estimatedCost = cost.totalCost;
        
        // Track total cost
        this.totalCost += cost.totalCost;
        
        // Track cost if PR information is available
        if (request.pullRequest) {
          await this.costTracker.trackUsage(
            request.pullRequest.repository,
            tokenUsage,
            'review',
            request.pullRequest.number,
            {
              filesReviewed: request.changes.length,
              findingsCount: request.findings.length,
              chunkInfo: request.context?.chunkInfo
            }
          );
        }
        
        return {
          ...reviewData,
          usage: tokenUsage
        };
      },
      {
        operation: `review-${request.pullRequest?.number || 'local'}`,
        metadata: {
          repository: request.pullRequest?.repository,
          filesCount: request.changes.length,
          findingsCount: request.findings.length
        }
      }
    );
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string
  ): Promise<OpenAI.Chat.ChatCompletion> {
    if (this.config.enableFunctionCalling) {
      // Use function calling
      return await this.client.chat.completions.create({
        model: this.config.model || 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        functions: PromptTemplates.getFunctionDefinitions(),
        function_call: { name: 'submit_review' },
        ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
        ...(this.config.maxTokens !== undefined ? { max_tokens: this.config.maxTokens } : {})
      });
    } else {
      // Use regular completion with JSON mode
      return await this.client.chat.completions.create({
        model: this.config.model || 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt + '\n\nRespond with valid JSON matching the review schema.' }
        ],
        response_format: { type: 'json_object' },
        ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
        ...(this.config.maxTokens !== undefined ? { max_tokens: this.config.maxTokens } : {})
      });
    }
  }

  /**
   * Parse OpenAI response
   */
  private parseResponse(response: OpenAI.Chat.ChatCompletion): Omit<Review, 'usage'> {
    const message = response.choices[0]?.message;
    
    if (!message) {
      throw new Error('No response from OpenAI');
    }
    
    let reviewData: any;
    
    if (message.function_call) {
      // Parse function call arguments
      try {
        reviewData = JSON.parse(message.function_call.arguments);
      } catch (error) {
        throw new Error(`Failed to parse function call response: ${error}`);
      }
    } else if (message.content) {
      // Parse JSON response
      try {
        reviewData = JSON.parse(message.content);
      } catch (error) {
        throw new Error(`Failed to parse JSON response: ${error}`);
      }
    } else {
      throw new Error('No content in OpenAI response');
    }
    
    // Validate with Zod schema
    const validation = ReviewSchema.safeParse(reviewData);
    
    if (!validation.success) {
      throw new Error(
        `Invalid review format: ${validation.error.errors.map(e => e.message).join(', ')}`
      );
    }
    
    return validation.data as Omit<Review, 'usage'>;
  }

  /**
   * Merge reviews from multiple chunks
   */
  private mergeChunkReviews(
    reviews: Review[],
    analysis: ReturnType<EnhancedContextManager['analyzeAndChunk']>
  ): Review {
    if (reviews.length === 0) {
      throw new Error('No reviews to merge');
    }

    if (reviews.length === 1) {
      return reviews[0];
    }

    // Merge comments from all reviews
    const allComments = reviews.flatMap(r => r.comments);
    
    // Merge suggestions
    const allSuggestions = reviews.flatMap(r => r.suggestions);
    
    // Determine overall verdict
    const verdicts = reviews.map(r => r.summary.verdict);
    let overallVerdict: 'approve' | 'request-changes' | 'comment';
    
    if (verdicts.includes('request-changes')) {
      overallVerdict = 'request-changes';
    } else if (verdicts.includes('comment')) {
      overallVerdict = 'comment';
    } else {
      overallVerdict = 'approve';
    }

    // Calculate average confidence
    const avgConfidence = reviews.reduce((sum, r) => sum + r.summary.confidence, 0) / reviews.length;

    // Merge metrics
    const mergedMetrics = {
      issuesFound: reviews.reduce((sum, r) => sum + r.metrics.issuesFound, 0),
      criticalIssues: reviews.reduce((sum, r) => sum + r.metrics.criticalIssues, 0),
      improvements: reviews.reduce((sum, r) => sum + r.metrics.improvements, 0),
      estimatedImpact: this.determineOverallImpact(reviews.map(r => r.metrics.estimatedImpact))
    };

    // Calculate total usage
    const totalUsage: TokenUsage = {
      promptTokens: reviews.reduce((sum, r) => sum + r.usage.promptTokens, 0),
      completionTokens: reviews.reduce((sum, r) => sum + r.usage.completionTokens, 0),
      totalTokens: reviews.reduce((sum, r) => sum + r.usage.totalTokens, 0),
      model: reviews[0].usage.model,
      estimatedCost: reviews.reduce((sum, r) => sum + r.usage.estimatedCost, 0)
    };

    return {
      summary: {
        verdict: overallVerdict,
        confidence: avgConfidence,
        message: `Reviewed ${analysis.summary.totalChanges} changes across ${analysis.chunks.length} chunks using ${analysis.summary.recommendedStrategy} strategy. Found ${analysis.summary.criticalFindings} critical issues.`
      },
      comments: allComments,
      suggestions: allSuggestions,
      metrics: mergedMetrics,
      usage: totalUsage
    };
  }

  /**
   * Determine overall impact from multiple impacts
   */
  private determineOverallImpact(impacts: string[]): 'critical' | 'high' | 'medium' | 'low' {
    if (impacts.includes('critical')) return 'critical';
    if (impacts.includes('high')) return 'high';
    if (impacts.includes('medium')) return 'medium';
    return 'low';
  }

  /**
   * Generate code fix for an issue
   */
  async generateCodeFix(
    file: string,
    issue: string,
    code: string,
    context?: string
  ): Promise<{
    fixedCode: string;
    explanation: string;
    usage: TokenUsage;
  }> {
    return await this.retryManager.executeWithRetry(
      async () => {
        // Check cost limit before making request
        if (this.config.costLimit && this.totalCost >= this.config.costLimit) {
          throw new Error(`Cost limit exceeded: ${CostCalculator.formatCost(this.totalCost)} >= ${CostCalculator.formatCost(this.config.costLimit)}`);
        }

        const prompt = PromptTemplates.createFixPrompt(file, issue, code, context);
        
        const response = await this.client.chat.completions.create({
          model: this.config.model || 'gpt-4-turbo-preview',
          messages: [
            { 
              role: 'system', 
              content: 'You are an expert code reviewer. Generate a fix for the issue described. Respond in JSON format with keys: fixedCode, explanation.'
            },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
          ...(this.config.maxTokens !== undefined ? { max_tokens: this.config.maxTokens } : {})
        });
        
        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No response from OpenAI');
        }
        
        const result = JSON.parse(content);
        
        // Add usage information
        const usage = response.usage;
        const tokenUsage: TokenUsage = {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
          model: response.model,
          estimatedCost: 0
        };
        
        // Calculate cost
        const cost = CostCalculator.calculateCost(tokenUsage);
        tokenUsage.estimatedCost = cost.totalCost;
        
        // Track total cost
        this.totalCost += cost.totalCost;
        
        return {
          fixedCode: result.fixedCode,
          explanation: result.explanation,
          usage: tokenUsage
        };
      },
      {
        operation: `fix-${file}`,
        metadata: { file, issue }
      }
    );
  }

  /**
   * Analyze context usage for a request
   */
  async analyzeContextUsage(request: CodeReviewRequest): Promise<{
    analysis: ReturnType<EnhancedContextManager['analyzeAndChunk']>;
    contextStats: ReturnType<EnhancedContextManager['getContextUsageStats']>;
    recommendations: string[];
  }> {
    const analysis = this.enhancedContextManager.analyzeAndChunk(
      request.changes,
      request.findings
    );

    const contextStats = this.enhancedContextManager.getContextUsageStats();

    const recommendations: string[] = [];

    // Add recommendations based on analysis
    if (analysis.chunks.length > 3) {
      recommendations.push(
        `Large PR detected: ${analysis.chunks.length} chunks needed. Consider splitting into smaller PRs.`
      );
    }

    if (analysis.summary.criticalFindings > 5) {
      recommendations.push(
        `High number of critical findings (${analysis.summary.criticalFindings}). Focus on security issues first.`
      );
    }

    if (analysis.summary.estimatedTotalTokens > contextStats.availableTokens * 2) {
      recommendations.push(
        `PR size exceeds 2x context window. Enable token optimization for better results.`
      );
    }

    return {
      analysis,
      contextStats,
      recommendations
    };
  }

  /**
   * Get retry statistics
   */
  getRetryStats(): ReturnType<RetryManager['getRetryStats']> {
    return this.retryManager.getRetryStats();
  }

  /**
   * Reset retry manager
   */
  resetRetryManager(): void {
    this.retryManager.reset();
  }

  /**
   * Get total cost of all requests
   */
  getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Reset cost tracking
   */
  resetCostTracking(): void {
    this.totalCost = 0;
    this.costTracker.clear();
  }

  /**
   * Get cost tracker instance
   */
  getCostTracker(): InMemoryCostTracker {
    return this.costTracker;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AIServiceConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update retry manager if retry config changed
    if (config.retry) {
      this.retryManager = new RetryManager(this.config.retry);
    }
    
    // Update context managers if model or token config changed
    if (config.model || config.maxTokens || config.contextWindowSize) {
      this.contextManager = new ContextManager(
        this.config.model,
        this.config.maxTokens
      );
      
      this.enhancedContextManager = new EnhancedContextManager({
        model: this.config.model,
        contextWindowSize: this.config.contextWindowSize,
        reservedTokens: this.config.maxTokens || 4000,
        enableSmartChunking: true,
        prioritizeSecurityIssues: this.config.prioritizeSecurityIssues !== false
      });
    }
  }
}