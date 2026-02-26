import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { Model, ModelInputMap, ModelParameter } from '../types';

const Admin: React.FC = () => {
  const { user } = useAuth();
  const { addCustomModel } = useApp();
  const navigate = useNavigate();

  const [jsonInput, setJsonInput] = useState('');
  const [parsedModel, setParsedModel] = useState<Partial<Model> | null>(null);
  
  // Model Details Form
  const [modelName, setModelName] = useState('');
  const [modelDesc, setModelDesc] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!user) {
      return (
          <div className="flex flex-col items-center justify-center py-20 text-carbon-muted">
              <div className="mb-4 p-4 rounded-full bg-carbon-card border border-carbon-border">
                <svg className="w-8 h-8 text-carbon-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <p className="mb-4">Restricted Access</p>
              <Button variant="primary" onClick={() => navigate('/login')} size="sm">Log In to Console</Button>
          </div>
      );
  }

  // --- Smart Parsing Logic ---
  const extractPayload = (input: string): any => {
      // 1. Remove comments
      // Matches /* ... */ OR // ... (but NOT http://)
      let text = input.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1').trim();

      // 2. Locate "web_app_id". This is our anchor.
      // Matches "web_app_id": or 'web_app_id': or web_app_id:
      const match = text.match(/(["']?)web_app_id\1\s*:/);
      
      if (!match) {
          // Fallback: Try strict parse of whole text if user pasted just JSON
          try { return JSON.parse(text); } catch(e) { throw new Error("Could not find 'web_app_id' key in input."); }
      }

      const anchorIndex = match.index!;

      // 3. Find the Opening Brace '{' before the anchor
      let openBraceIndex = -1;
      for (let i = anchorIndex; i >= 0; i--) {
          if (text[i] === '{') {
              openBraceIndex = i;
              break;
          }
      }
      if (openBraceIndex === -1) throw new Error("Found web_app_id but could not find opening object brace.");

      // 4. Find the Closing Brace '}' matching the opener
      let balance = 0;
      let closeBraceIndex = -1;
      for (let i = openBraceIndex; i < text.length; i++) {
          if (text[i] === '{') balance++;
          if (text[i] === '}') balance--;
          
          if (balance === 0) {
              closeBraceIndex = i;
              break;
          }
      }
      if (closeBraceIndex === -1) throw new Error("Could not find matching closing brace for the object.");

      const candidate = text.substring(openBraceIndex, closeBraceIndex + 1);

      // 5. Try Strict Parse
      try {
          return JSON.parse(candidate);
      } catch (strictError) {
          // 6. If strict fails, try to repair JS Object Literal to JSON
          // This handles: { key: 'value' } -> { "key": "value" }
          try {
              let repaired = candidate;
              // Quote unquoted keys (simple alphanumeric)
              repaired = repaired.replace(/([{,]\s*)([a-zA-Z0-9_]+?)\s*:/g, '$1"$2":');
              // Replace single quotes with double quotes (basic)
              repaired = repaired.replace(/'/g, '"');
              // Remove trailing commas
              repaired = repaired.replace(/,(\s*})/g, '$1');
              
              return JSON.parse(repaired);
          } catch (repairError) {
              throw new Error("Found payload object but failed to parse JSON. Please ensure keys are quoted.");
          }
      }
  };

  const generateLabel = (key: string): string => {
      // Input: "103:INTConstant.value"
      // Remove Prefix "103:"
      const rawName = key.split(':').pop() || key; // "INTConstant.value"
      
      const parts = rawName.split('.');
      const lastPart = parts[parts.length - 1]; // "value"
      
      let label = lastPart;
      
      // Heuristic: If last part is generic (value, text, int), include the parent name
      // e.g. "INTConstant.value" -> "INTConstant Value"
      // e.g. "NanoBanana.temperature" -> "Temperature"
      if (['value', 'text', 'int', 'float', 'number'].includes(lastPart.toLowerCase()) && parts.length > 1) {
         // Get the part before dot
         const parent = parts[parts.length-2];
         // Clean up parent name (e.g. BizyAir_NanoBananaPro -> NanoBananaPro)
         const cleanParent = parent.replace(/BizyAir_|CR_|TTP_/g, '');
         label = `${cleanParent} ${lastPart}`;
      } else {
         // Just use last part for things like "temperature", "steps", "cfg"
         label = lastPart;
      }
      
      // Convert snake_case to Title Case
      // "character_consistency" -> "Character Consistency"
      return label
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1') // Space before camelCase caps
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());
  };

  const handleAnalyze = () => {
      setError(null);
      try {
          const data = extractPayload(jsonInput);
          
          if (!data.web_app_id || !data.input_values) {
              throw new Error("Invalid structure. Extracted object must contain 'web_app_id' and 'input_values'.");
          }

          const map: ModelInputMap = { images: [], prompt: '', customParams: [] };
          const knownKeys = new Set<string>();
          
          // Phase 1: Detect Standard Fields
          Object.entries(data.input_values).forEach(([key, value]) => {
              const lowerKey = key.toLowerCase();
              
              if (key.includes('LoadImage.image')) {
                  map.images.push(key);
                  knownKeys.add(key);
              } else if (typeof value === 'string' && (lowerKey.includes('text') || lowerKey.includes('prompt')) && !map.prompt) {
                  // Primary Prompt (First one found usually)
                  map.prompt = key;
                  knownKeys.add(key);
              } else if (typeof value === 'string' && (lowerKey.includes('text') || lowerKey.includes('prompt')) && map.prompt && !map.negative_prompt) {
                  // Negative Prompt (Second one found)
                  map.negative_prompt = key;
                  knownKeys.add(key);
              } else if (key.includes('PrimitiveInt.value') || lowerKey.includes('width') || lowerKey.includes('height')) {
                  // Resolution detection
                   if (typeof value === 'number' && (value === 1024 || value === 512 || value === 768 || value === 832 || value === 1216)) {
                       if (!map.width) { map.width = key; knownKeys.add(key); }
                       else if (!map.height) { map.height = key; knownKeys.add(key); }
                   }
              } else if (lowerKey.includes('seed')) {
                  map.seed = key;
                  knownKeys.add(key);
              }
          });

          // Phase 2: Detect Custom Params (Everything else)
          Object.entries(data.input_values).forEach(([key, value]) => {
              if (knownKeys.has(key)) return;
              
              const lowerKey = key.toLowerCase();
              // Ignore batch_size generally
              if (lowerKey.includes('batch_size')) return;
              // ALLOW aspect_ratio and resolution now

              const label = generateLabel(key);

              if (typeof value === 'number') {
                  map.customParams!.push({
                      key,
                      label,
                      type: 'number',
                      defaultValue: value
                  });
              } else if (typeof value === 'boolean') {
                  map.customParams!.push({
                      key,
                      label,
                      type: 'boolean',
                      defaultValue: value
                  });
              } else if (typeof value === 'string' && !value.startsWith('http') && value.length < 50) {
                  // Short strings are likely settings (not prompts)
                  map.customParams!.push({
                      key,
                      label,
                      type: 'string',
                      defaultValue: value
                  });
              }
          });

          // Fallback: If no prompt found, try to find biggest string
          if (!map.prompt) {
             let longestKey = '';
             let maxLength = 0;
             Object.entries(data.input_values).forEach(([key, value]) => {
                 if (typeof value === 'string' && value.length > maxLength && !map.images.includes(key)) {
                     maxLength = value.length;
                     longestKey = key;
                 }
             });
             if (longestKey) {
                 map.prompt = longestKey;
                 // Remove from custom params if it was added there
                 map.customParams = map.customParams?.filter(p => p.key !== longestKey);
             }
          }

          setParsedModel({
              web_app_id: data.web_app_id,
              input_map: map
          });
          
      } catch (err: any) {
          console.error(err);
          setError(err.message);
          setParsedModel(null);
      }
  };

  const handleSave = () => {
      if (!parsedModel || !modelName) return;
      
      const newModel: Model = {
          id: `custom-${Date.now()}`,
          name: modelName,
          version: '1.0',
          description: modelDesc || 'Custom uploaded workflow',
          isCustom: true,
          web_app_id: parsedModel.web_app_id,
          input_map: parsedModel.input_map
      };

      addCustomModel(newModel);
      navigate('/');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20">
        <div className="border-b border-carbon-border pb-6">
            <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
                Model Registry
            </h1>
            <p className="text-sm text-carbon-muted">
                Paste a BizyAir API JSON payload (or full JS Fetch snippet) to automatically register a new workflow.
                <br/>
                <span className="text-xs opacity-70">The system will automatically strip comments and find the configuration object.</span>
            </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Input */}
            <div className="space-y-4">
                <div className="carbon-card p-1 bg-[#050505]">
                    <textarea 
                        className="w-full h-[500px] bg-transparent p-4 text-xs font-mono text-green-400 focus:outline-none resize-none placeholder-green-900/50"
                        placeholder={`// Paste JS or JSON here\nconst response = await fetch(..., {\n  body: JSON.stringify({\n    "web_app_id": 45506,\n    ...\n    "103:INTConstant.value": 6  // Will become a slider\n  })\n})`}
                        value={jsonInput}
                        onChange={(e) => setJsonInput(e.target.value)}
                        spellCheck={false}
                    ></textarea>
                </div>
                <div className="flex justify-end">
                    <Button onClick={handleAnalyze} disabled={!jsonInput.trim()} variant="secondary">
                        Analyze Payload
                    </Button>
                </div>
                {error && (
                    <div className="p-3 bg-red-900/10 border border-red-900/20 rounded text-xs text-red-400 font-mono">
                        Error: {error}
                    </div>
                )}
            </div>

            {/* Right: Preview & Save */}
            <div className="space-y-6">
                {parsedModel ? (
                    <div className="carbon-card p-6 space-y-6 animate-fade-in bg-carbon-card">
                        <div className="flex items-center gap-3 text-green-400 text-sm font-medium pb-4 border-b border-carbon-border">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Valid Configuration Detected
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-carbon-surface rounded border border-carbon-border">
                                <span className="text-[10px] text-carbon-muted uppercase tracking-wide block mb-1">Web App ID</span>
                                <span className="text-white font-mono text-sm">{parsedModel.web_app_id}</span>
                            </div>
                            <div className="p-3 bg-carbon-surface rounded border border-carbon-border">
                                <span className="text-[10px] text-carbon-muted uppercase tracking-wide block mb-1">Inputs</span>
                                <span className="text-white font-mono text-sm">{parsedModel.input_map?.images?.length || 0} Images</span>
                            </div>
                        </div>

                        {/* Param Preview */}
                        <div className="space-y-2">
                             <div className="text-[10px] text-carbon-muted uppercase tracking-wide">Detected Parameters</div>
                             <div className="bg-carbon-surface border border-carbon-border rounded divide-y divide-carbon-border">
                                 {/* Main Inputs */}
                                 {parsedModel.input_map?.prompt && (
                                     <div className="p-2 flex justify-between items-center text-xs">
                                         <span className="text-carbon-text">Prompt</span>
                                         <span className="font-mono text-[10px] text-carbon-muted truncate max-w-[150px]">{parsedModel.input_map.prompt}</span>
                                     </div>
                                 )}
                                 
                                 {/* Custom Params */}
                                 {parsedModel.input_map?.customParams?.map((p, i) => (
                                     <div key={i} className="p-2 flex justify-between items-center text-xs">
                                         <div className="flex items-center gap-2">
                                             <span className="text-carbon-text">{p.label}</span>
                                             <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                                 p.type === 'number' ? 'bg-blue-500/20 text-blue-400' :
                                                 p.type === 'boolean' ? 'bg-purple-500/20 text-purple-400' :
                                                 'bg-orange-500/20 text-orange-400'
                                             }`}>{p.type}</span>
                                         </div>
                                         <span className="font-mono text-[10px] text-carbon-muted truncate max-w-[100px]">{String(p.defaultValue)}</span>
                                     </div>
                                 ))}
                                 
                                 {(!parsedModel.input_map?.customParams || parsedModel.input_map.customParams.length === 0) && (
                                     <div className="p-2 text-xs text-carbon-muted italic">No extra parameters detected</div>
                                 )}
                             </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-carbon-border">
                             <div>
                                <label className="block text-[11px] font-medium uppercase text-carbon-muted mb-2">Model Name</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2 rounded carbon-input text-sm"
                                    placeholder="e.g. Nano Banana Pro"
                                    value={modelName}
                                    onChange={(e) => setModelName(e.target.value)}
                                />
                             </div>
                             <div>
                                <label className="block text-[11px] font-medium uppercase text-carbon-muted mb-2">Description</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2 rounded carbon-input text-sm"
                                    placeholder="Brief description of function..."
                                    value={modelDesc}
                                    onChange={(e) => setModelDesc(e.target.value)}
                                />
                             </div>
                        </div>

                        <Button 
                            onClick={handleSave} 
                            disabled={!modelName} 
                            className="w-full"
                        >
                            Register Model
                        </Button>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-carbon-muted/30 border-2 border-dashed border-carbon-border rounded-lg p-8">
                        <svg className="w-12 h-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                        <p className="text-sm">Waiting for payload...</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default Admin;