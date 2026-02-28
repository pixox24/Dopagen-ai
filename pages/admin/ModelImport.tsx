import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button';
import { Model, ModelSchema, SchemaInput } from '../../types';
import { ASPECT_RATIOS, QUALITY_LEVELS, RESOLUTION_MAP } from '../../constants';

const ModelImport: React.FC = () => {
  const { addCustomModel } = useApp();
  const navigate = useNavigate();

  const [jsonInput, setJsonInput] = useState('');
  const [parsedSchema, setParsedSchema] = useState<ModelSchema | null>(null);
  
  // Model Details Form
  const [modelName, setModelName] = useState('');
  const [modelDesc, setModelDesc] = useState('');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Resolution Configuration
  const [defaultRatio, setDefaultRatio] = useState<string>('1:1');
  const [defaultQuality, setDefaultQuality] = useState<string>('1K');

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setThumbnail(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  /**
   * CORE PARSING LOGIC
   * Converts raw BizyAir JSON input_values into a UI Schema.
   * Now supports pasting full JS Fetch snippets.
   * 
   * ENHANCED: Auto-detects width/height fields and configures dynamic resolution mapping
   */
  const parsePayload = (rawInput: string): ModelSchema => {
      let data: any;
      const input = rawInput.trim();

      // --- STEP 1: Try Direct JSON Parse ---
      try {
          data = JSON.parse(input);
      } catch (e) {
          // --- STEP 2: Handle JavaScript Snippets ---
          const stringifyIndex = input.indexOf('JSON.stringify');
          
          if (stringifyIndex === -1) {
              throw new Error("Invalid JSON format. If pasting code, ensure it contains JSON.stringify({...})");
          }

          const openBraceIndex = input.indexOf('{', stringifyIndex);
          if (openBraceIndex === -1) {
               throw new Error("Found JSON.stringify but could not find an object '{' inside.");
          }

          let balance = 0;
          let closeBraceIndex = -1;
          for (let i = openBraceIndex; i < input.length; i++) {
              if (input[i] === '{') balance++;
              else if (input[i] === '}') balance--;
              
              if (balance === 0) {
                  closeBraceIndex = i;
                  break;
              }
          }

          if (closeBraceIndex === -1) {
               throw new Error("Could not find matching closing brace '}' for the object.");
          }

          let extracted = input.substring(openBraceIndex, closeBraceIndex + 1);

          // --- STEP 3: Sanitize JS Object Literal to Valid JSON ---
          extracted = extracted.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
          extracted = extracted.replace(/([{,]\s*)([a-zA-Z0-9_]+?)\s*:/g, '$1"$2":');
          extracted = extracted.replace(/,(\s*})/g, '$1');

          try {
              data = JSON.parse(extracted);
          } catch (extractError) {
              console.error("Extraction Failed:", extractError);
              throw new Error("无法从代码中提取有效的 JSON body，请确认示例中包含 JSON.stringify({...})");
          }
      }

      // --- STEP 4: Validate Content Structure ---
      if (!data.web_app_id) {
          throw new Error("Missing 'web_app_id' in JSON payload.");
      }
      if (!data.input_values) {
          throw new Error("Missing 'input_values' in JSON payload.");
      }

      const inputs: SchemaInput[] = [];
      
      // Track width/height fields for smart mapping
      let widthKey: string | null = null;
      let heightKey: string | null = null;
      let sizeKey: string | null = null;
      let sizeValue: any = null;

      // First pass: identify special fields
      Object.entries(data.input_values).forEach(([key, value]) => {
          const parts = key.split('.');
          const paramName = (parts.length > 1 ? parts[parts.length - 1] : key).toLowerCase();
          
          // Detect width fields (width, custom_width, img_width, etc.)
          if (paramName === 'width' || paramName.endsWith('_width') || paramName.startsWith('width_')) {
              widthKey = key;
          }
          // Detect height fields (height, custom_height, img_height, etc.)
          else if (paramName === 'height' || paramName.endsWith('_height') || paramName.startsWith('height_')) {
              heightKey = key;
          }
          // Detect size field
          else if (paramName === 'size') {
              sizeKey = key;
              sizeValue = value;
          }
      });

      // Second pass: create input definitions
      Object.entries(data.input_values).forEach(([key, value]) => {
          if (!key) return;

          const parts = key.split('.');
          const paramName = (parts.length > 1 ? parts[parts.length - 1] : key).toLowerCase();
          
          const rawLabel = (parts.length > 1 ? parts[parts.length - 1] : key);
          const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1).replace(/_/g, ' ');

          const inputDef: SchemaInput = {
              key: key,
              label: label,
              type: 'text',
              defaultValue: value,
              required: true
          };

          // --- ENHANCED RULE MAPPING ---

          // 1. Images
          if (paramName === 'image' || paramName.includes('loadimage')) {
              inputDef.type = 'image';
              inputDef.label = 'Input Image';
          }
          // 2. Prompts
          else if (paramName === 'prompt' || paramName === 'text') {
              inputDef.type = 'textarea';
              inputDef.label = paramName === 'text' ? 'Text Input' : 'Prompt';
          }
          else if (paramName === 'negative_prompt') {
              inputDef.type = 'textarea';
              inputDef.label = 'Negative Prompt';
          }
          // 3. Size selector - if it's "Custom", we'll map width/height dynamically
          else if (key === sizeKey && value === 'Custom') {
              inputDef.type = 'hidden';
              inputDef.defaultValue = 'Custom';
              // This triggers the dynamic width/height mapping
          }
          else if (key === sizeKey) {
              inputDef.type = 'select';
              inputDef.label = 'Size';
              inputDef.options = ['Custom', '1024x1024', '2048x2048', '1024x576', '576x1024'];
              inputDef.defaultValue = value || 'Custom';
          }
          // 4. Sliders (Temperature / Top_P)
          else if (paramName === 'temperature') {
              inputDef.type = 'slider';
              inputDef.min = 0;
              inputDef.max = 1;
              inputDef.step = 0.01;
              inputDef.defaultValue = typeof value === 'number' ? value : 1.0;
          }
          else if (paramName === 'top_p') {
              inputDef.type = 'slider';
              inputDef.min = 0;
              inputDef.max = 1;
              inputDef.step = 0.01;
              inputDef.defaultValue = typeof value === 'number' ? value : 0.9;
          }
          else if (paramName === 'cfg' || paramName === 'guidance_scale') {
              inputDef.type = 'slider';
              inputDef.min = 1;
              inputDef.max = 20;
              inputDef.step = 0.1;
              inputDef.defaultValue = typeof value === 'number' ? value : 7.0;
          }
          // 5. Seed (Hidden + AutoGen)
          else if (paramName.includes('seed') && typeof value === 'number') {
              inputDef.type = 'hidden';
              inputDef.generate = 'random_int';
          }
          // 6. ENHANCED: Width/Height with dynamic mapping
          // If this is the detected width field AND size is "Custom" or width field exists
          else if (key === widthKey) {
              inputDef.type = 'hidden';
              inputDef.mapping = 'width';
              inputDef.label = 'Width (Auto)';
              // Don't use the original value, it will be calculated from Ratio+Quality
          }
          else if (key === heightKey) {
              inputDef.type = 'hidden';
              inputDef.mapping = 'height';
              inputDef.label = 'Height (Auto)';
              // Don't use the original value, it will be calculated from Ratio+Quality
          }
          // 7. Other Global Bindings
          else if (paramName === 'aspect_ratio') {
              inputDef.type = 'hidden';
              inputDef.mapping = 'aspect_ratio';
          }
          else if (paramName === 'resolution' || paramName === 'quality') {
              inputDef.type = 'hidden';
              inputDef.mapping = 'quality';
          }
          // 8. Batch Size
          else if (paramName === 'batch_size' || paramName === 'batch') {
              inputDef.type = 'select';
              inputDef.label = 'Batch Size';
              inputDef.options = ['1', '2', '3', '4'];
              inputDef.defaultValue = 1;
          }
          // 9. Generic Fallbacks
          else {
              if (typeof value === 'number') {
                  inputDef.type = 'number';
              } else if (typeof value === 'boolean') {
                  inputDef.type = 'boolean';
              } else if (typeof value === 'object' && value !== null) {
                  inputDef.type = 'hidden';
              } else {
                  inputDef.type = 'text';
              }
          }

          inputs.push(inputDef);
      });

      return {
          model_id: Number(data.web_app_id),
          inputs: inputs
      };
  };

  const handleAnalyze = () => {
      setError(null);
      try {
          const schema = parsePayload(jsonInput);
          setParsedSchema(schema);
      } catch (err: any) {
          console.error(err);
          setError(err.message);
          setParsedSchema(null);
      }
  };

  const handleSave = () => {
      if (!parsedSchema || !modelName) return;
      
      // Calculate default dimensions based on Ratio + Quality
      const dimensions = RESOLUTION_MAP[defaultRatio]?.[defaultQuality] || { w: 1024, h: 1024 };
      
      // Build default form state with calculated values
      const defaultFormState: Record<string, any> = {};
      
      parsedSchema.inputs.forEach(input => {
          if (input.mapping === 'width') {
              defaultFormState[input.key] = dimensions.w;
          } else if (input.mapping === 'height') {
              defaultFormState[input.key] = dimensions.h;
          } else if (input.mapping === 'aspect_ratio') {
              defaultFormState[input.key] = defaultRatio;
          } else if (input.mapping === 'quality') {
              defaultFormState[input.key] = defaultQuality;
          } else if (input.key.toLowerCase().includes('size') && input.defaultValue === 'Custom') {
              defaultFormState[input.key] = 'Custom';
          } else {
              defaultFormState[input.key] = input.defaultValue;
          }
      });
      
      const newModel: Model = {
          id: `custom-${Date.now()}`,
          name: modelName,
          version: '1.0',
          description: modelDesc || 'Custom uploaded workflow',
          isCustom: true,
          schema: parsedSchema,
          thumbnail: thumbnail || undefined,
          defaultParams: {
              aspect_ratio: defaultRatio,
              quality: defaultQuality,
              width: dimensions.w,
              height: dimensions.h,
              input_values: defaultFormState
          }
      };

      addCustomModel(newModel);
      navigate('/');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20">
        <div className="border-b border-carbon-border pb-6">
            <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
                Import Model via API Schema
            </h1>
            <p className="text-sm text-carbon-muted">
                Paste the <code>body</code> JSON from a BizyAir API request. <br/>
                <span className="text-white">You can also paste the full JavaScript <code>fetch</code> code snippet.</span>
            </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Input */}
            <div className="space-y-4">
                <div className="carbon-card p-1 bg-[#050505]">
                    <textarea 
                        className="w-full h-[500px] bg-transparent p-4 text-xs font-mono text-green-400 focus:outline-none resize-none placeholder-green-900/50"
                        placeholder={`// Paste JSON or Full JS Code here\n\nconst url = "https://api.bizyair.cn/...";\nconst response = await fetch(url, {\n  method: "POST",\n  body: JSON.stringify({\n    "web_app_id": 45952,\n    "input_values": { ... }\n  })\n});`}
                        value={jsonInput}
                        onChange={(e) => setJsonInput(e.target.value)}
                        spellCheck={false}
                    ></textarea>
                </div>
                <div className="flex justify-end">
                    <Button onClick={handleAnalyze} disabled={!jsonInput.trim()} variant="secondary">
                        Analyze Input
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
                {parsedSchema ? (
                    <div className="carbon-card p-6 space-y-6 animate-fade-in bg-carbon-card">
                        <div className="flex items-center gap-3 text-green-400 text-sm font-medium pb-4 border-b border-carbon-border">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Schema Generated Successfully
                        </div>

                         {/* Schema Overview */}
                         <div className="space-y-2">
                              <div className="text-[10px] text-carbon-muted uppercase tracking-wide">Generated UI Fields</div>
                              <div className="bg-carbon-surface border border-carbon-border rounded divide-y divide-carbon-border max-h-[300px] overflow-y-auto custom-scrollbar">
                                  {parsedSchema.inputs.map((input, i) => (
                                      <div key={i} className="p-3 flex justify-between items-center text-xs">
                                          <div className="flex flex-col gap-1">
                                              <span className="text-carbon-text font-medium">{input.label}</span>
                                              <span className="text-[10px] text-carbon-muted font-mono opacity-50">{input.key}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                              {input.mapping && (
                                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/20">
                                                      Bound: {input.mapping}
                                                  </span>
                                              )}
                                              {input.generate && (
                                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-500/20 text-purple-400 border border-purple-500/20">
                                                      Auto: {input.generate}
                                                  </span>
                                              )}
                                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${input.type === 'hidden' ? 'bg-zinc-800 text-zinc-500 border-zinc-700' : 'bg-carbon-base border-carbon-border text-carbon-text'}`}>
                                                  {input.type}
                                              </span>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                         </div>
                         
                         {/* Resolution Configuration */}
                         {parsedSchema.inputs.some(i => i.mapping === 'width' || i.mapping === 'height') && (
                             <div className="space-y-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                                 <div className="flex items-center gap-2 text-blue-400 text-xs font-medium">
                                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                     </svg>
                                     Dynamic Resolution Configured
                                 </div>
                                 <div className="grid grid-cols-2 gap-4">
                                     <div>
                                         <label className="block text-[10px] text-carbon-muted mb-1.5">Default Ratio</label>
                                         <select 
                                             value={defaultRatio}
                                             onChange={(e) => setDefaultRatio(e.target.value)}
                                             className="w-full p-2 rounded bg-carbon-surface border border-carbon-border text-xs"
                                         >
                                             {ASPECT_RATIOS.map(ratio => (
                                                 <option key={ratio} value={ratio}>{ratio}</option>
                                             ))}
                                         </select>
                                     </div>
                                     <div>
                                         <label className="block text-[10px] text-carbon-muted mb-1.5">Default Quality</label>
                                         <select 
                                             value={defaultQuality}
                                             onChange={(e) => setDefaultQuality(e.target.value)}
                                             className="w-full p-2 rounded bg-carbon-surface border border-carbon-border text-xs"
                                         >
                                             {QUALITY_LEVELS.map(q => (
                                                 <option key={q.value} value={q.value}>{q.label}</option>
                                             ))}
                                         </select>
                                     </div>
                                 </div>
                                 <div className="text-[10px] text-carbon-muted">
                                     Default size: <span className="text-blue-400 font-mono">
                                         {RESOLUTION_MAP[defaultRatio]?.[defaultQuality]?.w || 1024} x {RESOLUTION_MAP[defaultRatio]?.[defaultQuality]?.h || 1024}px
                                     </span>
                                 </div>
                             </div>
                         )}

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
                                    placeholder="Brief description..."
                                    value={modelDesc}
                                    onChange={(e) => setModelDesc(e.target.value)}
                                />
                             </div>
                             <div>
                                <label className="block text-[11px] font-medium uppercase text-carbon-muted mb-2">Thumbnail (Optional)</label>
                                <input 
                                    type="file"
                                    onChange={handleThumbnailUpload}
                                    className="w-full text-xs text-carbon-muted"
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
                        <p className="text-sm">Waiting for valid JSON or JS...</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default ModelImport;
