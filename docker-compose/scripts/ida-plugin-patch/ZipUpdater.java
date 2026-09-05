import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.Enumeration;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/**
 * Replace selected entries in a jar/zip with files from a patch directory.
 * Usage: java ZipUpdater <jar> <patchRoot>
 */
public class ZipUpdater {
    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("Usage: java ZipUpdater <jar> <patchRoot>");
            System.exit(2);
        }
        File jarFile = new File(args[0]);
        File patchRoot = new File(args[1]);
        if (!jarFile.isFile()) {
            System.err.println("Jar not found: " + jarFile);
            System.exit(1);
        }
        File tmp = File.createTempFile("patched-", ".jar");
        int replaced = 0;
        int added = 0;
        java.util.Set<String> existing = new java.util.HashSet<>();
        try (ZipFile zip = new ZipFile(jarFile);
             ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(tmp))) {
            byte[] buf = new byte[16384];
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                existing.add(entry.getName());
                File replacement = new File(patchRoot, entry.getName());
                if (entry.isDirectory()) {
                    ZipEntry dir = new ZipEntry(entry.getName());
                    dir.setTime(entry.getTime());
                    zos.putNextEntry(dir);
                    zos.closeEntry();
                    continue;
                }
                byte[] data;
                if (replacement.isFile()) {
                    data = Files.readAllBytes(replacement.toPath());
                    replaced++;
                } else {
                    data = readAll(zip.getInputStream(entry), buf);
                }
                writePreservingMethod(zos, entry, data);
            }
            added = addNewConsentClasses(zos, patchRoot, existing);
        }
        Files.move(tmp.toPath(), jarFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
        System.out.println("Patched " + jarFile + " (" + replaced + " entries replaced, " + added + " added)");
        if (replaced == 0 && added == 0) {
            System.err.println("Warning: no matching class files were replaced");
            System.exit(1);
        }
    }

    /**
     * Add consent-service class files that are not already in the target jar
     * (e.g. UuidStringAttributeConverter). Skip IDA plugin classes and ZipUpdater.
     */
    private static int addNewConsentClasses(ZipOutputStream zos, File patchRoot, java.util.Set<String> existing)
            throws IOException {
        File consentRoot = new File(patchRoot, "io/mosip/esignet");
        if (!consentRoot.isDirectory()) {
            return 0;
        }
        int added = 0;
        java.util.ArrayDeque<File> queue = new java.util.ArrayDeque<>();
        queue.add(consentRoot);
        while (!queue.isEmpty()) {
            File dir = queue.removeFirst();
            File[] children = dir.listFiles();
            if (children == null) {
                continue;
            }
            for (File child : children) {
                if (child.isDirectory()) {
                    if ("plugin".equals(child.getName()) && child.getParentFile().getName().equals("esignet")) {
                        continue;
                    }
                    queue.add(child);
                    continue;
                }
                if (!child.getName().endsWith(".class")) {
                    continue;
                }
                String rel = patchRoot.toPath().relativize(child.toPath()).toString().replace(File.separatorChar, '/');
                if (existing.contains(rel)) {
                    continue;
                }
                byte[] data = Files.readAllBytes(child.toPath());
                ZipEntry out = new ZipEntry(rel);
                out.setTime(child.lastModified());
                out.setMethod(ZipEntry.DEFLATED);
                zos.putNextEntry(out);
                zos.write(data);
                zos.closeEntry();
                added++;
                System.out.println("Added " + rel);
            }
        }
        return added;
    }

    private static byte[] readAll(InputStream in, byte[] buf) throws IOException {
        try (InputStream input = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            int n;
            while ((n = input.read(buf)) >= 0) {
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }

    /**
     * Spring Boot nested jars in BOOT-INF/lib must remain STORED (uncompressed)
     * or JarUrlClassLoader cannot load them.
     */
    private static void writePreservingMethod(ZipOutputStream zos, ZipEntry src, byte[] data) throws IOException {
        ZipEntry out = new ZipEntry(src.getName());
        out.setTime(src.getTime());
        if (src.getMethod() == ZipEntry.STORED) {
            CRC32 crc = new CRC32();
            crc.update(data);
            out.setMethod(ZipEntry.STORED);
            out.setSize(data.length);
            out.setCompressedSize(data.length);
            out.setCrc(crc.getValue());
        } else {
            out.setMethod(ZipEntry.DEFLATED);
        }
        zos.putNextEntry(out);
        zos.write(data);
        zos.closeEntry();
    }
}
