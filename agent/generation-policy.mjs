const key=(provider,model)=>JSON.stringify([provider,model]);
/** The runtime receives a fixed, non-secret policy snapshot. It cannot be edited
 * by a teacher RPC or a document instruction. Step/tool/retry budgets stay intact. */
export function applyGenerationPolicy(config,policy={entries:{}}) {
  const values=policy.entries?.[key(config.provider,config.model)];
  const {temperature:_temperature,reasoningEffort:_effort,...rest}=config;
  if(!values)return {...config,maxTokens:Math.min(config.maxTokens??2048,2048)};
  return {...rest,maxTokens:values.maxTokens,...(values.temperature===null?{}:{temperature:values.temperature}),...(values.reasoningEffort===null?{}:{reasoningEffort:values.reasoningEffort})};
}
