import os, glob

def resolve_file(filepath, strategy):
    filepath = os.path.join(os.path.dirname(__file__), filepath)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except Exception as e:
        print(f'Error reading {filepath}: {e}')
        return
        
    new_lines = []
    i = 0
    in_conflict = False
    head_lines = []
    native_lines = []
    current_block = None
    
    while i < len(lines):
        line = lines[i]
        if line.startswith('<<<<<<< HEAD'):
            in_conflict = True
            current_block = 'head'
            head_lines = []
            native_lines = []
            i += 1
            continue
        elif line.startswith('======='):
            current_block = 'native'
            i += 1
            continue
        elif line.startswith('>>>>>>>'):
            in_conflict = False
            
            # Apply strategy
            if strategy == 'keep_both':
                new_lines.extend(head_lines)
                new_lines.extend(native_lines)
            elif strategy == 'keep_native':
                new_lines.extend(native_lines)
            elif strategy == 'keep_head':
                new_lines.extend(head_lines)
                
            i += 1
            continue
            
        if in_conflict:
            if current_block == 'head':
                head_lines.append(line)
            else:
                native_lines.append(line)
        else:
            new_lines.append(line)
        
        i += 1
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f'Resolved {filepath} with strategy {strategy}')

files_to_resolve = [
    ('backend/prisma/schema.prisma', 'keep_both'),
    ('backend/src/modules/cashbook/cashbook-posting.service.ts', 'keep_both'),
    ('backend/src/modules/cashbook/cashbook-settings.service.ts', 'keep_both'),
    ('backend/src/modules/cashbook/cashbook.controller.ts', 'keep_both'),
    ('backend/src/modules/cashbook/cashbook.domain.ts', 'keep_both'),
    ('backend/src/modules/cashbook/cashbook.events.ts', 'keep_both'),
    ('backend/src/modules/cashbook/cashbook.routes.ts', 'keep_both'),
    ('backend/src/modules/cashbook/cashbook.schemas.ts', 'keep_both'),
    ('backend/src/modules/cashbook/cashbook.service.ts', 'keep_both'),
    
    ('backend/src/modules/inventory/purchase-receipt.schemas.ts', 'keep_native'),
    ('backend/src/modules/inventory/purchase-receipt.service.ts', 'keep_native'),
    ('backend/src/modules/inventory/purchase-receipt.types.ts', 'keep_native'),
    ('backend/src/modules/inventory/purchase-return.schemas.ts', 'keep_native'),
    ('backend/src/modules/inventory/purchase-return.service.ts', 'keep_native'),
    
    ('backend/src/modules/orders/orders.controller.ts', 'keep_native'),
    ('backend/src/modules/orders/orders.schemas.ts', 'keep_native'),
    ('backend/src/modules/orders/orders.service.ts', 'keep_native'),
    ('backend/src/modules/orders/sales-return.schemas.ts', 'keep_native'),
    ('backend/src/modules/orders/sales-return.service.ts', 'keep_native'),
    
    ('frontend/src/api/cashbook.test.ts', 'keep_native'),
    ('frontend/src/api/cashbook.ts', 'keep_native'),
    ('frontend/src/features/cashbook/CashbookScreen.tsx', 'keep_native'),
    ('frontend/src/features/cashbook/cashbookPrint.ts', 'keep_native'),
    ('frontend/src/features/cashbook/cashbookViewModel.test.ts', 'keep_native'),
    ('frontend/src/features/cashbook/cashbookViewModel.ts', 'keep_native'),
]

for filepath, strategy in files_to_resolve:
    resolve_file(filepath, strategy)
