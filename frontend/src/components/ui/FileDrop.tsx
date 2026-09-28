import { useId, useRef, useState, type DragEvent } from 'react';
import { FileText, Trash2, UploadCloud } from 'lucide-react';
import { formatBytes } from '@/lib/format';
import { ALLOWED_EXT, validateFiles } from './fileValidation';

interface FileDropProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  label?: string;
  hint?: string;
}

/** Zone de glisser-déposer accessible (le bouton reste utilisable au clavier). */
export function FileDrop({ files, onChange, maxFiles = 5, label = 'Pièces justificatives', hint }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const id = useId();

  const add = (list: FileList | null) => {
    if (!list) return;
    const { accepted, errors: errs } = validateFiles(files, Array.from(list), maxFiles);
    setErrors(errs);
    if (accepted.length) onChange([...files, ...accepted]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    add(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        className={`drop ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <UploadCloud size={30} className="drop-icon" aria-hidden="true" />
        <strong style={{ color: 'var(--ink)' }}>
          <span className="drop-pointer">Glissez vos fichiers ici</span>
          <span className="drop-touch">Ajoutez vos justificatifs</span>
        </strong>
        <span id={`${id}-hint`}>{hint ?? `PDF, JPG ou PNG · 10 Mo maximum par fichier · ${maxFiles} fichiers au plus`}</span>
        <label htmlFor={id} className="btn alt sm" style={{ marginTop: 6 }}>
          Choisir des fichiers
        </label>
        <input
          ref={inputRef}
          id={id}
          type="file"
          multiple={maxFiles > 1}
          accept={ALLOWED_EXT.join(',')}
          className="sr-only"
          aria-describedby={`${id}-hint`}
          aria-label={label}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <div role="alert" aria-live="assertive">
        {errors.length > 0 && (
          <ul className="field" style={{ color: 'var(--danger)', paddingLeft: 18 }}>
            {errors.map((er) => (
              <li key={er}>{er}</li>
            ))}
          </ul>
        )}
      </div>
      {files.length > 0 && (
        <ul className="file-list" aria-label="Fichiers sélectionnés">
          {files.map((f, i) => (
            <li className="file-item" key={`${f.name}-${f.size}`}>
              <FileText size={18} aria-hidden="true" color="var(--blue)" />
              <span className="fname" title={f.name}>
                {f.name}
              </span>
              <span className="caption">{formatBytes(f.size)}</span>
              <button
                type="button"
                className="btn text sm"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                aria-label={`Retirer ${f.name}`}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
