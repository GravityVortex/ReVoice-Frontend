
#!/bin/bash

target_dir="/Users/xuww/Downloads/MrBeast_1_100_000_000"
output=""
first=true

# 检查目录是否存在
if [ ! -d "$target_dir" ]; then
    echo "错误：目录 '$target_dir' 不存在"
    exit 1
fi

cd "$target_dir" || exit 1
index=0

for file in *; do
    if [ -f "$file" ]; then
        if [ "$first" = true ]; then
            output="'$file'"
            # output="'$file'"$'\n'
            first=false
        else
            # output="$output, '$file'"

            output="$output,"$'\n'"'$file'"
            # if (( index % 50 == 0 )); then
            #     output="$output,"$'\n'"'$file'"
            # else
            #     output="$output, '$file'"
            # fi
        fi
        ((index++))
    fi
done

echo "$output"


